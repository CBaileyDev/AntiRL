import React from "react";
export function normalizedBoost(value?:number|null) {return value!=null && Number.isFinite(value) ? Math.min(100,Math.max(0,value)) : null;}
export default function BoostRing({value}:{value?:number|null}) {
 const boost=normalizedBoost(value);
 return <div className="boost-ring" role="meter" aria-label="Current boost" aria-valuemin={0} aria-valuemax={100} aria-valuenow={boost ?? undefined} aria-valuetext={boost==null?"Unknown boost":`${Math.round(boost)} percent`}>
  <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20" fill="none" stroke="var(--line-strong)" strokeWidth="3"/>{boost!=null&&<circle cx="24" cy="24" r="20" fill="none" stroke="var(--orange-team)" strokeWidth="3" pathLength="100" strokeDasharray={`${boost} 100`} transform="rotate(-90 24 24)"/>}</svg>
  <span>{boost==null?"--":Math.round(boost)}<small>{boost==null?"BOOST":"% BOOST"}</small></span>
 </div>;
}
