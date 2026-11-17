/* Road and barrel directions for the crossing view.
   Zero skew: the road centerline is perpendicular to the barrel axis.
   A skew of θ degrees swings the barrel off that perpendicular by θ
   (HDS-5 §5.4.2: skew is measured from a line normal to the barrel).

   Stations: s runs along the barrel (s = 0 at the inlet face, s = L at the
   outlet face). t runs along the roadway. The embankment base spans that
   full barrel length, and the crest is centered on s = L/2. */
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

  function crossingLayout(o){
    const L=Math.max(+o.L||1,1);
    const crest=+o.crest;
    const fp=+o.fp;
    const bedIn=+o.bedIn, bedOut=+o.bedOut;
    const crestLen=Math.max(48,+o.crestLen||120);
    let paveW=Math.max(12,+o.paveW||Math.min(32,L*0.42));
    paveW=Math.min(paveW, L*0.58);
    const halfBot=Math.max(4,+o.halfBot||8);
    const halfBank=Math.max(halfBot+4,+o.halfBank||halfBot+12);
    const sideRun=Math.max(12,+o.sideRun||16);
    const sMid=L/2;
    const sCrest0=sMid-paveW/2, sCrest1=sMid+paveW/2;
    const lay={
      L:L, crest:crest, fp:fp, bedIn:bedIn, bedOut:bedOut,
      crestLen:crestLen, paveW:paveW, halfBot:halfBot, halfBank:halfBank, sideRun:sideRun,
      sMid:sMid, sCrest0:sCrest0, sCrest1:sCrest1,
      toeIn:0, toeOut:L, toeZ:fp, halfRoad:crestLen/2,
      headwalls:[{s:0,end:'inlet'},{s:L,end:'outlet'}]
    };
    lay.crestCentroidS=(lay.sCrest0+lay.sCrest1)/2;
    lay.baseWidth=lay.toeOut-lay.toeIn;
    return lay;
  }

  function groundAt(lay,s,t){
    const ad=Math.abs(t);
    const bed=s<lay.L*0.5?lay.bedIn:lay.bedOut;
    let nat;
    if(ad<=lay.halfBot) nat=bed;
    else if(ad<lay.halfBank) nat=bed+(ad-lay.halfBot)/(lay.halfBank-lay.halfBot)*(lay.fp-bed);
    else nat=lay.fp;
    if(s<lay.toeIn||s>lay.toeOut) return nat;
    let ridge;
    if(s<=lay.sCrest0){
      const den=lay.sCrest0-lay.toeIn;
      ridge=lay.toeZ+(den<=1e-6?1:(s-lay.toeIn)/den)*(lay.crest-lay.toeZ);
    }else if(s>=lay.sCrest1){
      const den=lay.toeOut-lay.sCrest1;
      ridge=lay.toeZ+(den<=1e-6?1:(lay.toeOut-s)/den)*(lay.crest-lay.toeZ);
    }else ridge=lay.crest;
    if(ad<=lay.halfRoad) return Math.max(nat,ridge);
    if(ad<lay.halfRoad+lay.sideRun){
      const u=(ad-lay.halfRoad)/lay.sideRun;
      return Math.max(nat, ridge+(lay.fp-ridge)*u);
    }
    return nat;
  }

  function layoutCheck(lay){
    const midErr=Math.abs(lay.crestCentroidS-lay.L/2)/lay.L;
    const toes=lay.headwalls.length===2&&lay.headwalls[0].s===lay.toeIn&&lay.headwalls[1].s===lay.toeOut&&lay.headwalls[0].end==='inlet'&&lay.headwalls[1].end==='outlet';
    const base=Math.abs(lay.baseWidth-lay.L)<1e-6;
    const slopes=lay.sCrest0>lay.toeIn+0.5&&lay.sCrest1<lay.toeOut-0.5;
    const zMid=groundAt(lay,lay.L/2,0);
    const zIn=groundAt(lay,lay.toeIn,0);
    const zOut=groundAt(lay,lay.toeOut,0);
    const over=Math.abs(zMid-lay.crest)<1e-6;
    const down=zIn<lay.crest-0.5&&zOut<lay.crest-0.5;
    const centered=midErr<=0.10;
    return {ok:centered&&toes&&base&&slopes&&over&&down, midErr:midErr, toes:toes, base:base, slopes:slopes, over:over, down:down, zMid:zMid, zIn:zIn, zOut:zOut};
  }

  const api={crossingAxes:crossingAxes,axesDot:axesDot,crossingLayout:crossingLayout,groundAt:groundAt,layoutCheck:layoutCheck};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.CrossingFrame=api;
})(typeof window!=='undefined'?window:globalThis);
