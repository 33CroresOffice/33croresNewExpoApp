import { Stack } from 'expo-router';

export default function ProviderAuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="register-success" />
      <Stack.Screen name="otp-verify" />
    </Stack>
  );
}
