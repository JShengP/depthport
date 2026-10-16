# SPDX-License-Identifier: AGPL-3.0-only
"""DA3 adapter math/contract tests with fabricated model outputs; not pretrained tests."""
from types import SimpleNamespace
import numpy as np
import pytest
from depthport.engines import resize_da3_input, da3_output, metric_scale, DA3Adapter
from depthport.cloud import CameraGeometry, make_cloud


def fixture(h=280,w=504):
    bgr=np.zeros((h,w,3),np.uint8);bgr[:]=(10,20,30)
    pred=SimpleNamespace(depth=np.full((1,h,w),3,np.float32),processed_images=bgr[...,::-1][None].copy(),
                         conf=np.ones((1,h,w),np.float32),sky=np.zeros((1,h,w),bool),is_metric=False)
    intr={'fx':600.,'fy':600.,'cx':w/2,'cy':h/2,'source':'provided_intrinsics'}
    return pred,bgr,intr


def test_metric_formula_exactly_once_and_raw_preserved():
    p,b,k=fixture();r=da3_output(p,b,k,True)
    np.testing.assert_array_equal(r.raw_depth,3.)
    np.testing.assert_array_equal(r.depth,6.)
    assert r.info['raw_to_output_scale']==2 and r.units=='estimated_m'
    np.testing.assert_array_equal(r.bgr,b)


def test_da3_small_retains_raw_relative_depth_no_inverse():
    p,b,k=fixture();r=da3_output(p,b,k,False)
    np.testing.assert_array_equal(r.depth,3.)
    assert r.units=='relative' and r.info['raw_to_output_scale']==1


def test_unexpected_nested_already_metric_output_refused():
    p,b,k=fixture();p.is_metric=True
    with pytest.raises(RuntimeError,match='second metric conversion'):da3_output(p,b,k,True)


@pytest.mark.parametrize('h,w',[(1080,1920),(720,1280),(1920,1080),(333,517),(16,16)])
def test_da3_resize_tracks_K_at_exact_processed_size(h,w):
    b=np.zeros((h,w,3),np.uint8);k=CameraGeometry(65).intrinsics(w,h)
    out,ko=resize_da3_input(b,k,504);nh,nw=out.shape[:2]
    assert nh%14==nw%14==0 and max(nh,nw)==504
    assert ko['fx']==pytest.approx(k['fx']*nw/w)
    assert ko['fy']==pytest.approx(k['fy']*nh/h)
    assert ko['cx']==pytest.approx((k['cx']+.5)*nw/w-.5)
    assert ko['cy']==pytest.approx((k['cy']+.5)*nh/h-.5)


def test_metric_uses_resized_not_original_focal():
    b=np.zeros((1008,1008,3),np.uint8);k={'fx':600.,'fy':600.,'cx':503.5,'cy':503.5}
    b2,k2=resize_da3_input(b,k,504)
    out,factor=metric_scale(np.ones(b2.shape[:2],np.float32),k2)
    assert factor==1 and np.all(out==1)


@pytest.mark.parametrize('field',['depth','processed_images','conf','sky'])
def test_da3_unexpected_resize_rejected(field):
    p,b,k=fixture()
    setattr(p,field,np.zeros((1,12,14,3),np.uint8) if field=='processed_images' else np.zeros((1,12,14)))
    with pytest.raises(RuntimeError):da3_output(p,b,k,True)


def test_optional_confidence_and_sky_absence_supported():
    p,b,k=fixture();p.conf=p.sky=None;r=da3_output(p,b,k,False)
    assert r.confidence is None and r.sky is None


def test_relative_export_header_never_claims_meters():
    from depthport.cloud import export_binary_ply
    p,b,k=fixture();r=da3_output(p,b,k,False)
    c=make_cloud(b,r.depth,intrinsics=k,units='relative')
    ply=export_binary_ply(c['points_raw'],units='relative',engine='da3-small')
    header=ply.split(b'end_header')[0]
    assert b'units relative' in header and b'estimated_m' not in header


def test_invalid_da3_resolution_refused(monkeypatch):
    monkeypatch.setenv('DA3_PROCESS_RES','500')
    with pytest.raises(ValueError):DA3Adapter('da3-small')


def test_no_silent_shape_or_confidence_fabrication():
    p,b,k=fixture();p.depth[:]=np.nan
    with pytest.raises(RuntimeError,match='positive finite'):da3_output(p,b,k,False)
