import { BaseAvatarRenderAdapter } from './BaseAvatarRenderAdapter';
import { TalkingHeadVideoAdapter } from './TalkingHeadVideoAdapter';
import { ThreeDAvatarAdapter } from './ThreeDAvatarAdapter';

export type AvatarRenderAdapterName = 'three_d' | 'talking_head_video';

export function createAvatarRenderAdapter(name: AvatarRenderAdapterName): BaseAvatarRenderAdapter {
  if (name === 'talking_head_video') {
    return new TalkingHeadVideoAdapter();
  }
  return new ThreeDAvatarAdapter();
}
