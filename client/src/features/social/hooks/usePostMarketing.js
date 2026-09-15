import { useCallback, useEffect, useState } from 'react';

import { feedApi } from '../../feed/api/feedApi';

// Social backlog rank 9. A feed post carries no permission block — resolving
// one for every post on the Pulse would undo OPT-017/PERF-003 for cards nobody
// is about to share. This asks for exactly one, when a share surface opens.
//
// `status` starts 'idle' and only leaves it once `enabled` is true, so the
// guard on a closed modal is neither "allowed" nor "loading": it has not been
// asked. A failed request resolves to a null block, which exportGuard.js reads
// as blocked — a permission we could not confirm is not a permission.
export function usePostMarketing(postId, enabled) {
  const [state, setState] = useState({ postId: null, status: 'idle', marketing: null });

  const refresh = useCallback(async () => {
    if (!postId) return null;
    setState({ postId, status: 'loading', marketing: null });
    try {
      const response = await feedApi.getPostMarketing(postId);
      const marketing = response?.marketing ?? null;
      setState({ postId, status: 'ready', marketing });
      return marketing;
    } catch {
      setState({ postId, status: 'failed', marketing: null });
      return null;
    }
  }, [postId]);

  useEffect(() => {
    if (!enabled || !postId) return undefined;

    let active = true;
    setState({ postId, status: 'loading', marketing: null });

    feedApi
      .getPostMarketing(postId)
      .then((response) => {
        if (active) setState({ postId, status: 'ready', marketing: response?.marketing ?? null });
      })
      .catch(() => {
        if (active) setState({ postId, status: 'failed', marketing: null });
      });

    return () => {
      active = false;
    };
  }, [postId, enabled]);

  return {
    ...(state.postId === postId ? state : { postId, status: 'idle', marketing: null }),
    refresh,
  };
}
