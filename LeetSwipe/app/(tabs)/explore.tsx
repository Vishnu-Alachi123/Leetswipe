import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
  bg: '#0e1116',
  card: '#171c24',
  border: '#2a323d',
  text: '#e8edf3',
  muted: '#93a0b0',
  accent: '#4f9dff',
};

function Row({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

export default function AboutScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
        <Text style={styles.brand}>
          Leet<Text style={{ color: COLORS.accent }}>Swipe</Text>
        </Text>
        <Text style={styles.tagline}>Tinder, but for coding-interview reasoning.</Text>

        <Row
          title="How it works"
          body="Pick a topic, curated list (like NeetCode 150), or difficulty on the Topics tab, then swipe through the deck. Tap an answer to check it and read the explanation. Swipe right (or Save) to keep a question; swipe left (or Skip) to move on."
        />
        <Row
          title="Saved questions"
          body="Everything you save lands in the Saved tab. Use the Sort control in the top-right to sort by recency, difficulty, category, or title, and to filter by difficulty or category — arrange your review list however you like."
        />
        <Row
          title="Where questions come from"
          body="Each card is a standalone conceptual MCQ generated from a LeetCode problem by the Python pipeline in backend_question_generation/, tagged by topic, difficulty, and curated list. A scheduled job keeps the bank topped up. Questions teach the reasoning behind a problem, not just its answer."
        />
        <Row
          title="Live questions & sync"
          body="The app ships with a bundled sample deck so it runs with no setup. Point EXPO_PUBLIC_API_URL at the LeetSwipe API (server/) to serve live questions by topic and sync your saved list across devices."
        />

        <Text style={styles.footer}>Built by Vishnu Alachi</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  wrap: { padding: 22, gap: 14 },
  brand: { color: COLORS.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5, marginTop: 8 },
  tagline: { color: COLORS.muted, fontSize: 15, marginBottom: 8 },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 18,
  },
  cardTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800', marginBottom: 8 },
  body: { color: COLORS.muted, fontSize: 14, lineHeight: 21 },
  footer: { color: COLORS.muted, fontSize: 13, textAlign: 'center', marginTop: 10 },
});
