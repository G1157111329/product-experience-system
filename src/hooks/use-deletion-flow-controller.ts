'use client';

import { useRef, useSyncExternalStore } from 'react';
import {
  createDeletionFlowController,
  type DeletionFlowTarget,
  type DeletionImpact,
} from '@/lib/deletion-impact-ui';

type Dependencies = {
  load: (target: DeletionFlowTarget) => Promise<DeletionImpact>;
  remove: (target: DeletionFlowTarget) => Promise<void>;
  refresh: () => void | Promise<void>;
  onError: (error: unknown) => void;
};

export function useDeletionFlowController(dependencies: Dependencies) {
  const dependenciesRef = useRef(dependencies);
  dependenciesRef.current = dependencies;
  const controllerRef = useRef<ReturnType<typeof createDeletionFlowController> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createDeletionFlowController({
      load: (target) => dependenciesRef.current.load(target),
      remove: (target) => dependenciesRef.current.remove(target),
      refresh: () => dependenciesRef.current.refresh(),
      onError: (error) => dependenciesRef.current.onError(error),
    });
  }
  const controller = controllerRef.current;
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  return {
    state,
    request: controller.request,
    cancel: controller.cancel,
    confirm: controller.confirm,
  };
}
