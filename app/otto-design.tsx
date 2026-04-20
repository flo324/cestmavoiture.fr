import { Redirect } from 'expo-router';

/** La maquette Tailwind (`otto-design.web.tsx`) est réservée au build web. */
export default function OttoDesignNative() {
  return <Redirect href="/" />;
}
