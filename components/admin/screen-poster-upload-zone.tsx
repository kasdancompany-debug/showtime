"use client";

import { ExperiencePosterUploadZone } from "@/components/experiences/experience-poster-upload-zone";

type ScreenPosterUploadZoneProps = {
  disabled: boolean;
  onUploaded: (publicPath: string) => void;
};

/** Walk-in / projector lobby image — uploads via shared media API. */
export function ScreenPosterUploadZone({ disabled, onUploaded }: ScreenPosterUploadZoneProps) {
  return <ExperiencePosterUploadZone disabled={disabled} kind="screen" onUploaded={onUploaded} />;
}
