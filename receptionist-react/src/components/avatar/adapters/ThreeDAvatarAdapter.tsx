import React from 'react';

import AvatarScene from '../AvatarScene';
import { BaseAvatarRenderAdapter, AvatarRenderAdapterProps } from './BaseAvatarRenderAdapter';

export class ThreeDAvatarAdapter extends BaseAvatarRenderAdapter {
  readonly name = 'three_d';
  readonly isRealtime = true;

  render(props: AvatarRenderAdapterProps): React.ReactNode {
    return <AvatarScene {...props} />;
  }
}
