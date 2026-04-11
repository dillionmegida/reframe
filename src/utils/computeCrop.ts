export function computeCrop(
  interp: { x: number; y: number; scale: number },
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number
) {
  const vidAspect = sourceWidth / sourceHeight
  const outAspect = outputWidth / outputHeight

  let cropFracW: number
  let cropFracH: number
  if (outAspect < vidAspect) {
    cropFracH = 1 / Math.max(interp.scale, 0.0001)
    cropFracW = (outAspect / vidAspect) * cropFracH
  } else {
    cropFracW = 1 / Math.max(interp.scale, 0.0001)
    cropFracH = (vidAspect / outAspect) * cropFracW
  }

  cropFracW = Math.min(1, Math.max(0.0001, cropFracW))
  cropFracH = Math.min(1, Math.max(0.0001, cropFracH))

  const cropW = cropFracW * sourceWidth
  const cropH = cropFracH * sourceHeight
  const cropX = (sourceWidth - cropW) * Math.max(0, Math.min(1, interp.x))
  const cropY = (sourceHeight - cropH) * Math.max(0, Math.min(1, interp.y))

  return { cropW, cropH, cropX, cropY }
}
