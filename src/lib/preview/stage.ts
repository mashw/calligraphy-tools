export type StageFrame = {
  widthPx: number;
  heightPx: number;
  leftEdgeX: number;
  rightEdgeX: number;
  centerX: number;
  baselineTopY: number;
  lineGapPx: number;
};

export type StageFrameParams = {
  maxMM: number;
  pxPerMM: number;
  baseMargin: number;
  minWidthPx: number;
  maxWidthPx: number;
  lineGapPx: number;
  lineCount: number;
  baselineTopY?: number;
  minHeightPx?: number;
  bottomPadPx?: number;
};

export function buildStageFrame({
  maxMM,
  pxPerMM,
  baseMargin,
  minWidthPx,
  maxWidthPx,
  lineGapPx,
  lineCount,
  baselineTopY = 50,
  minHeightPx = 180,
  bottomPadPx = 20,
}: StageFrameParams): StageFrame {
  const halfContentPx = Math.ceil((maxMM * pxPerMM) / 2);
  const computedWidth = Math.max(minWidthPx, halfContentPx * 2 + baseMargin * 2);
  const widthPx = Math.min(maxWidthPx, computedWidth);

  const centerX = Math.floor(widthPx / 2);
  const rightEdgeX = widthPx - baseMargin;
  const leftEdgeX = baseMargin;

  const heightPx = Math.max(minHeightPx, baselineTopY + lineCount * lineGapPx + bottomPadPx);

  return {
    widthPx,
    heightPx,
    leftEdgeX,
    rightEdgeX,
    centerX,
    baselineTopY,
    lineGapPx,
  };
}
