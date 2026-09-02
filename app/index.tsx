import { Redirect } from 'expo-router';
import { DEFAULT_AUTH_ROUTE } from '@/constants/appRole';

export default function Index() {
  return <Redirect href={DEFAULT_AUTH_ROUTE as any} />;
}
