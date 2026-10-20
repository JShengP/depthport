# SPDX-License-Identifier: AGPL-3.0-only
"""Opt-in fixed-step geometry experiment; never installed in app/worker defaults."""
import numpy as np
from depthport.tracking_estimator_shadow import snapshot,serial
from depthport.tracking_lifecycle_probe import require


def projection(state,covariance):
    """Freeze relative corner velocity on axes whose next size is non-positive.

    Conditional linear projection: center velocity and current position stay
    unchanged. The same T transforms the complete covariance, including cross
    terms. This is not a calibrated distribution over the trigger decision.
    """
    x=np.asarray(state);p=np.asarray(covariance)
    require(x.shape==(8,1) and p.shape==(8,8) and x.dtype==p.dtype==np.float64,'Pinned XYXY float64 state required')
    require(np.all(np.isfinite(x)) and np.all(np.isfinite(p)),'Finite estimator required')
    require(x[2,0]>x[0,0] and x[3,0]>x[1,0],'Positive pre-predict mean required; no posterior repair')
    f=np.eye(8);f[np.arange(4),np.arange(4)+4]=1
    prospective=f@x
    axes=[axis for axis in (0,1) if prospective[axis+2,0]<=prospective[axis,0]]
    t=np.eye(8)
    for axis in axes:
        a,b=axis+4,axis+6;t[a,:]=0;t[b,:]=0
        t[a,a]=t[a,b]=t[b,a]=t[b,b]=.5
    return axes,t,(t@x if axes else x.copy()),(t@p@t.T if axes else p.copy())


class GeometryProjection:
    """Enter after LifecycleProbe + EstimatorShadow; transform both replicas.

    The frozen shadow then checks every ORIGINAL native predict/update exactly.
    Historical state_post/covariance_post remain the last actual accepted update;
    native predict overwrites state_prior/covariance_prior in the usual way.
    """
    def __init__(self,tracker,lifecycle,shadow,enabled):
        self.tracker=tracker;self.lifecycle=lifecycle;self.shadow=shadow;self.enabled=enabled;self.restore={};self.last=None

    def __enter__(self):
        require(not self.restore,'Geometry control already attached')
        t=self.tracker;update=t.update;predict=t._predict_tracklets
        def observed_update(detections,frame=None,timestamp=None):
            self.last={'frame':self.lifecycle.frame+1,'rows':[]}
            return update(detections,frame=frame,timestamp=timestamp)
        def controlled_predict(tracks,timing):
            require(not timing.uses_elapsed_time and not timing.skip_predict and timing.frame_step==1,'Fixed one-frame timing required')
            for track in tracks:
                token=self.lifecycle.token(track);e=track.state_estimator;s=self.shadow.shadows[token]
                before=snapshot(e);require(before==snapshot(s),'Pre-projection shadow differs')
                x=e.kf.state;p=e.kf.state_covariance
                prepositive=bool(x[2,0]>x[0,0] and x[3,0]>x[1,0])
                if not prepositive and not self.enabled:
                    axes=[];matrix=np.eye(8);mean=x.copy();cov=p.copy()
                else:axes,matrix,mean,cov=projection(x,p)
                if self.enabled and axes:
                    # No changes to F/H/Q/R, motion cache, clocks, IDs, stored
                    # accepted posteriors, association, lifetime or inputs.
                    e.kf.state=mean;e.kf.state_covariance=cov
                    sa,st,sx,sp=projection(s.kf.state,s.kf.state_covariance)
                    require(sa==axes and np.array_equal(st,matrix),'Detached projection differs')
                    s.kf.state=sx;s.kf.state_covariance=sp
                after=snapshot(e);require(after==snapshot(s),'Post-projection shadow differs')
                self.last['rows'].append({'token':token,'active':track.time_since_update==0,
                    'confirmed':track.tracker_id>=0,'prepositive':prepositive,'candidate_axes':axes,'applied':bool(self.enabled and axes),
                    'matrix':serial(matrix),'before':before,'projected':after})
            return predict(tracks,timing)
        for name,fn in (('update',observed_update),('_predict_tracklets',controlled_predict)):
            self.restore[name]=(name in vars(t),vars(t).get(name));setattr(t,name,fn)
        return self

    def __exit__(self,*exc):
        for name,(owned,value) in self.restore.items():
            if owned:setattr(self.tracker,name,value)
            else:delattr(self.tracker,name)
        self.restore.clear()
