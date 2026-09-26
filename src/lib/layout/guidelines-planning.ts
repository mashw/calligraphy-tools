export type GuidelinesPlanningVisibility = {
  avoidOccludingElements:boolean;
  externallyOccluded:boolean;
  maskEnabled:boolean;
  textLayoutRespectsMask:boolean;
  insideMask:boolean;
};

/** Combines the two independent text-planning constraints without affecting rendering. */
export function isGuidelinesPlanningPointBlocked(state:GuidelinesPlanningVisibility){
  return state.avoidOccludingElements&&state.externallyOccluded
    || state.maskEnabled&&state.textLayoutRespectsMask&&!state.insideMask;
}
