/**
 * `getReactNativePersistence` genuinely exists at runtime (Metro
 * resolves `firebase/auth`'s package.json "react-native" condition to
 * @firebase/auth's dist/rn build, which has it — verified in
 * node_modules/@firebase/auth/dist/rn/src/platform_react_native/persistence/react_native.d.ts,
 * matching Firebase's own documented usage). But the `firebase`
 * meta-package's exports map lists a top-level "types" key as a
 * sibling of "react-native" rather than nested inside it, so
 * TypeScript's static resolution always picks the generic types file
 * and never sees this export, on any moduleResolution/customConditions
 * setting. This patches just that gap — see lib/firebase.ts.
 */
// The top-level `import type` below (rather than one nested inside the
// `declare module` block) is what makes this file itself a module —
// required so `declare module 'firebase/auth'` below AUGMENTS the real
// module instead of replacing it outright (a `declare module` inside a
// non-module/"script" .d.ts file shadows the whole module).
import type { Persistence } from '@firebase/auth';

declare module 'firebase/auth' {
  type ReactNativeAsyncStorageLike = {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
  };

  export function getReactNativePersistence(storage: ReactNativeAsyncStorageLike): Persistence;
}
