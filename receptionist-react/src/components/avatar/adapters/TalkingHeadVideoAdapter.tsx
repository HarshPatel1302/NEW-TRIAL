import React from 'react';

import { BaseAvatarRenderAdapter, AvatarRenderAdapterProps } from './BaseAvatarRenderAdapter';

export class TalkingHeadVideoAdapter extends BaseAvatarRenderAdapter {
  readonly name = 'talking_head_video';
  readonly isRealtime = false;

  render(_props: AvatarRenderAdapterProps): React.ReactNode {
    return (
      <div
        style={{
          display: 'grid',
          placeItems: 'center',
          width: '100%',
          height: '100%',
          color: '#f0f2f7',
          background: 'linear-gradient(160deg, rgba(20,28,41,0.9), rgba(7,12,18,0.94))',
          borderRadius: '14px',
          padding: '1rem',
          textAlign: 'center',
        }}
      >
        Talking-head video adapter is a phase-2 placeholder.
      </div>
    );
  }
}
