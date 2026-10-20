# SPDX-License-Identifier: AGPL-3.0-only
"""Detached numerical replay beside native calls; research only, raw data local."""
import copy
import dataclasses
import hashlib
import numpy as np
from depthport.tracking_lifecycle_probe import require


def serial(value):
    if isinstance(value,np.ndarray):
        require(np.all(np.isfinite(value)), 'Nonfinite internal array')
        return {'dtype':str(value.dtype),'shape':list(value.shape),'values':value.tolist(),
                'bytes_sha256':hashlib.sha256(value.tobytes(order='C')).hexdigest()}
    if dataclasses.is_dataclass(value):
        return {f.name:serial(getattr(value,f.name)) for f in dataclasses.fields(value)}
    if isinstance(value,dict):return {k:serial(v) for k,v in value.items()}
    if isinstance(value,(list,tuple)):return [serial(v) for v in value]
    if isinstance(value,np.generic):return value.item()
    require(value is None or isinstance(value,(float,int,str,bool)), 'Unexpected estimator field')
    return value


def snapshot(estimator):
    return {'kf':serial(vars(estimator.kf)), 'motion':serial(estimator.motion)}


def array(state,key):
    return np.asarray(state['kf'][key]['values'],dtype=state['kf'][key]['dtype'])


def numerical_checks(before,after,operation):
    """Exact native predict algebra; fixed diagnostic PSD/symmetry tolerance."""
    result={}
    if operation=='predict':
        f=array(after,'transition_mtx');x=array(before,'state');p=array(before,'state_covariance')
        result['mean_algebra_exact']=np.array_equal(array(after,'state'),f@x)
        result['covariance_algebra_exact']=np.array_equal(array(after,'state_covariance'),f@p@f.T+array(after,'process_noise'))
    for key in ('state_covariance','process_noise','measurement_noise'):
        matrix=array(after,key)
        result[key+'_symmetric']=bool(np.max(np.abs(matrix-matrix.T))<=1e-10)
        result[key+'_psd']=bool(np.linalg.eigvalsh((matrix+matrix.T)/2).min()>=-1e-10)
    return {k:bool(v) for k,v in result.items()}


class EstimatorShadow:
    """Enter AFTER LifecycleProbe. Never replace live solver or numerical code.

    Each birth starts a detached deep copy. Only that copy receives duplicate
    calls; live calls forward original objects once. Temporary estimator methods
    are removed even on failure; persistent detached histories span all frames.
    """
    def __init__(self,tracker,lifecycle):
        self.tracker=tracker;self.lifecycle=lifecycle;self.shadows={};self.last=None;self.restore={}

    def __enter__(self):
        require(not self.restore and not self.tracker.tracks,'Fresh tracker required')
        t=self.tracker;update=t.update;spawn=t._spawn_new_tracks
        def born(*args,**kwargs):
            previous=list(t.tracks);result=spawn(*args,**kwargs)
            for track in t.tracks[len(previous):]:
                token=self.lifecycle.token(track);e=track.state_estimator
                require(token not in self.shadows,'Repeated estimator ownership')
                self.shadows[token]=copy.deepcopy(e)
                self.last['births'].append({'token':token,'state':snapshot(e)})
            return result
        def observed(detections,frame=None,timestamp=None):
            self.last={'frame':self.lifecycle.frame+1,'births':[],'operations':[]};attached=[]
            try:
                for track in t.tracks:
                    token=self.lifecycle.token(track);e=track.state_estimator;s=self.shadows[token]
                    require(snapshot(e)==snapshot(s),'Continuous shadow diverged before frame')
                    for method in ('predict','update'):
                        require(method not in vars(e),'Estimator already instrumented')
                        original=getattr(e,method)
                        def wrapper(*args,_e=e,_s=s,_token=token,_method=method,_original=original,**kwargs):
                            before=snapshot(_e)
                            require(before==snapshot(_s),'Shadow pre-operation differs')
                            # The live operation is called exactly once with its original arguments.
                            result=_original(*args,**kwargs)
                            getattr(_s,_method)(*copy.deepcopy(args),**copy.deepcopy(kwargs))
                            after=snapshot(_e);require(after==snapshot(_s),'Shadow post-operation differs')
                            phase='prediction' if _method=='predict' else self.lifecycle.last['stages'][-1]['name']
                            self.last['operations'].append({'token':_token,'operation':_method,'phase':phase,
                                'arguments':serial(args),'keywords':serial(kwargs),'before':before,'after':after,
                                'checks':numerical_checks(before,after,_method)})
                            return result
                        setattr(e,method,wrapper);attached.append((e,method))
                return update(detections,frame=frame,timestamp=timestamp)
            finally:
                for e,method in reversed(attached):delattr(e,method)
        for name,fn in (('_spawn_new_tracks',born),('update',observed)):
            self.restore[name]=(name in vars(t),vars(t).get(name));setattr(t,name,fn)
        return self

    def __exit__(self,*exc):
        for name,(owned,value) in self.restore.items():
            if owned:setattr(self.tracker,name,value)
            else:delattr(self.tracker,name)
        self.restore.clear()
