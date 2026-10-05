import React from "react";
import PracticePanel from "./PracticePanel";
import type {ReplaySummary} from "../types";
interface GoalTrackerProps {onAskCoach?:(prompt:string)=>void;recentSummaries?:ReplaySummary[];mode?:string;playerId?:string|null;}
export default function GoalTracker({onAskCoach,mode="2v2",playerId}:GoalTrackerProps){
 return <><PracticePanel mode={mode} playerId={playerId}/>{onAskCoach&&<button className="btn secondary" onClick={()=>onAskCoach("Help me choose one evidence-backed practice priority, a feasible drill, success criterion and next-match cue. Do not invent telemetry, grades, promotion dates or universal numerical targets.")}>Choose a priority with Coach</button>}</>;
}
