import { Image } from 'expo-image';
import { Platform, StyleSheet } from 'react-native';

import { Collapsible } from '@/components/ui/collapsible';
import { ExternalLink } from '@/components/external-link';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Fonts } from '@/constants/theme';

export default function TabTwoScreen() {
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#D0D0D0', dark: '#353636' }}
      headerImage={
        <IconSymbol
          size={310}
          color="#808080"
          name="chevron.left.forwardslash.chevron.right"
          style={styles.headerImage}
        />
      }>
      <ThemedView style={styles.titleContainer}>
        <ThemedText
          type="title"
          style={{
            fontFamily: Fonts.rounded,
          }}>
          Utforsk
        </ThemedText>
      </ThemedView>
      <ThemedText>Denne appen inneholder eksempelkode som hjelper deg i gang.</ThemedText>
      <Collapsible title="Filbasert ruting">
        <ThemedText>
          Denne appen har to skjermer:{' '}
          <ThemedText type="defaultSemiBold">app/(tabs)/index.tsx</ThemedText> and{' '}
          <ThemedText type="defaultSemiBold">app/(tabs)/explore.tsx</ThemedText>
        </ThemedText>
        <ThemedText>
          Layout-filen i <ThemedText type="defaultSemiBold">app/(tabs)/_layout.tsx</ThemedText>{' '}
          setter opp fanenavigasjonen.
        </ThemedText>
        <ExternalLink href="https://docs.expo.dev/router/introduction">
          <ThemedText type="link">Les mer</ThemedText>
        </ExternalLink>
      </Collapsible>
      <Collapsible title="Støtte for Android, iOS og web">
        <ThemedText>
          Du kan åpne dette prosjektet på Android, iOS og web. For å åpne webversjonen, trykk{' '}
          <ThemedText type="defaultSemiBold">w</ThemedText> i terminalen som kjører prosjektet.
        </ThemedText>
      </Collapsible>
      <Collapsible title="Bilder">
        <ThemedText>
          For statiske bilder kan du bruke <ThemedText type="defaultSemiBold">@2x</ThemedText> og{' '}
          <ThemedText type="defaultSemiBold">@3x</ThemedText>-suffiks for å gi filer til
          ulike skjermtettheter.
        </ThemedText>
        <Image
          source={require('@/assets/images/react-logo.png')}
          style={{ width: 100, height: 100, alignSelf: 'center' }}
        />
        <ExternalLink href="https://reactnative.dev/docs/images">
          <ThemedText type="link">Les mer</ThemedText>
        </ExternalLink>
      </Collapsible>
      <Collapsible title="Komponenter for lyst og mørkt tema">
        <ThemedText>
          Denne malen støtter lyst og mørkt tema. Kroken{' '}
          <ThemedText type="defaultSemiBold">useColorScheme()</ThemedText> lar deg sjekke
          brukerens gjeldende fargeskjema, slik at du kan justere farger i UI-en.
        </ThemedText>
        <ExternalLink href="https://docs.expo.dev/develop/user-interface/color-themes/">
          <ThemedText type="link">Les mer</ThemedText>
        </ExternalLink>
      </Collapsible>
      <Collapsible title="Animasjoner">
        <ThemedText>
          Denne malen inneholder et eksempel på en animert komponent. Komponenten{' '}
          <ThemedText type="defaultSemiBold">components/HelloWave.tsx</ThemedText> bruker det kraftige{' '}
          <ThemedText type="defaultSemiBold" style={{ fontFamily: Fonts.mono }}>
            react-native-reanimated
          </ThemedText>{' '}
          biblioteket for å lage en vinkende hånd-animasjon.
        </ThemedText>
        {Platform.select({
          ios: (
            <ThemedText>
              Komponenten <ThemedText type="defaultSemiBold">components/ParallaxScrollView.tsx</ThemedText>{' '}
              gir en parallakseffekt for toppbildet.
            </ThemedText>
          ),
        })}
      </Collapsible>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  headerImage: {
    color: '#808080',
    bottom: -90,
    left: -35,
    position: 'absolute',
  },
  titleContainer: {
    flexDirection: 'row',
    gap: 8,
  },
});
