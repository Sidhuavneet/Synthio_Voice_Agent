import { MediaDeviceFailure } from "livekit-client";

/** Returns a user-facing message for a microphone failure, or null if the error isn't device related. */
export function describeMicrophoneError(error: unknown): string | null {
  switch (MediaDeviceFailure.getFailure(error)) {
    case MediaDeviceFailure.PermissionDenied:
      return "Microphone access is blocked. Allow it in your browser's site settings, then unmute to talk to the presenter.";
    case MediaDeviceFailure.NotFound:
      return "No microphone was found. Connect one, then unmute to talk to the presenter.";
    case MediaDeviceFailure.DeviceInUse:
      return "Your microphone is in use by another app. Close it, then unmute to try again.";
    case MediaDeviceFailure.Other:
      return "The microphone couldn't be started. Check your audio settings and unmute to try again.";
    default:
      return null;
  }
}
