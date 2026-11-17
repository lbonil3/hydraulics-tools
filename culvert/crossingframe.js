/* Road and barrel directions for the crossing view.
   Zero skew: the road centerline is perpendicular to the barrel axis.
   A skew of θ degrees swings the barrel off that perpendicular by θ
   (HDS-5 §5.4.2: skew is measured from a line normal to the barrel). */
(function(root){
  function crossingAxes(skewDeg){
    const a=(+skewDeg||0)*Math.PI/180;
    const road={x:0,y:1};
    const barrel={x:Math.cos(a),y:Math.sin(a)};
    return {road:road,barrel:barrel};
  }
  function axesDot(skewDeg){
    const a=crossingAxes(skewDeg);
    return a.road.x*a.barrel.x+a.road.y*a.barrel.y;
  }
  const api={crossingAxes:crossingAxes,axesDot:axesDot};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.CrossingFrame=api;
})(typeof window!=='undefined'?window:globalThis);
