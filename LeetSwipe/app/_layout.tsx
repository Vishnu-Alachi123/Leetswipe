import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { COLORS } from '@/constants/colors';

export const unstable_settings = {
  anchor: '(tabs)',
};

/**
 * Navigation chrome is pinned dark rather than following the system scheme.
 *
 * Every screen paints itself from the fixed dark palette in constants/colors,
 * so on a light-mode device the old `colorScheme === 'dark' ? …` check handed
 * back a white tab bar and white stack backgrounds framing a near-black app.
 * Until the screens themselves are theme-aware, the honest thing is one theme.
 */
const NAV_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: COLORS.bg,
    card: COLORS.card,
    border: COLORS.border,
    text: COLORS.text,
    primary: COLORS.accent,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={NAV_THEME}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="deck" options={{ headerShown: false, presentation: 'card' }} />
        {/* Both screens draw their own back control, so the stack header would
            be a second, redundant one. */}
        <Stack.Screen name="challenge" options={{ headerShown: false, presentation: "card" }} />
        <Stack.Screen name="pattern-match" options={{ headerShown: false, presentation: "card" }} />
      </Stack>
      {/* The app is dark everywhere, so the status bar text must be light. */}
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
