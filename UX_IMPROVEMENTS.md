# LeetSwipe UX Improvements — Based on Competitive Research

This document outlines specific, implementable UX changes that will make LeetSwipe feel polished and competitive with Duolingo, Quizlet, and AlgoExpert.

---

## Competitive Benchmarking

### What Works in Duolingo
- ✅ Celebratory animations on completion (confetti, hearts floating up)
- ✅ Streak counter prominently displayed (not hidden)
- ✅ Clear progress bar per session
- ✅ Bite-sized lessons (even if users have time for more, they don't need more)
- ✅ Joyful, warm color palette
- ✅ Immediate feedback ("Great job!", "Wow!")

### What Works in Quizlet
- ✅ Multiple study modes (cards, flashcard, match, test)
- ✅ Progress tracking (X/Y cards reviewed)
- ✅ Study set organization (visual thumbnails)
- ✅ Study goals (e.g., "Review 10 cards daily")

### What Works in AlgoExpert
- ✅ Time estimates on problems ("Easy • ~3 min")
- ✅ Problem categories with visual icons
- ✅ Completion badges ("Completed: 45/150")
- ✅ Filter sidebar (easy to re-filter)
- ✅ Video explanations (LeetSwipe has text; need to evaluate)

### What LeetCode Gets Wrong (UX-wise)
- ❌ Overwhelming problem library
- ❌ No gamification/streaks
- ❌ Grind culture messaging
- ❌ Dull interface (gray, utilitarian)
- ❌ No mobile-first design

---

## Specific UX Improvements (Priority Order)

### TIER 1: Quick Wins (Implement immediately, 1-2 week sprint)

#### 1.1: Add Confetti on Correct Answer

**Current behavior:** User answers correctly → green checkmark

**Improved behavior:** User answers correctly → confetti animation + celebratory message

**Implementation:**
- Add `react-native-confetti-cannon` package
- Show confetti on correct answer (in deck.tsx)
- Add messages: "Great!", "Nice!", "Nailed it!", "Perfect!" (random)
- Timing: Show for 2 seconds, then auto-advance to next question

**Code change (pseudo):**
```tsx
// In deck.tsx, when user answers correctly:
if (isCorrect && !showExplanation) {
  <ConfettiCannon count={100} origin={{ x: -10, y: 0 }} />
  <Text style={styles.celebration}>Nailed it!</Text>
  // Auto-advance after 2s
  setTimeout(() => showNextCard(), 2000);
}
```

**Impact:** Emotional reinforcement. Users feel accomplished. High engagement gain.

---

#### 1.2: Redesign Topic Picker Cards

**Current:** List with text-only difficulty counts

**Improved:** Visual cards with:
- Larger category icon (SVG symbols)
- Clear problem count ("42 problems")
- Visual difficulty distribution (3 colored bars: Easy/Medium/Hard)
- Tap to preview first problem

**Example card design:**
```
┌─────────────────────┐
│    📚 Arrays        │
│    42 problems      │
│                     │
│ ▪▪▪ ▪▪▪▪▪ ▪▪       │  (visual bar)
│ Easy  Medium  Hard  │
│                     │
│   Tap to start      │
└─────────────────────┘
```

**Implementation:**
- Replace text list with FlatList of cards (2 columns on tablet)
- Add icon library (SF Symbols or Ionicons)
- Color the difficulty bars (Easy: green, Medium: orange, Hard: red)
- Add card border + shadow for depth

**Impact:** Cleaner, more scannable. Modern feel. Increases completion rate.

---

#### 1.3: Add "Problem Time Estimate" Badge

**Current:** No indication if a problem takes 3 min or 15 min

**Improved:** Each problem shows estimated time

```
Question: "Two Sum"
Medium difficulty  •  ~5 min  •  Arrays & Hashing
```

**Where to add:**
- Deck screen (before showing question)
- Saved questions list
- Topic picker (aggregate: "avg 6 min per problem")

**Data source:** Add `estimatedMinutes: number` to MCQ schema (estimate based on difficulty: Easy=3, Medium=5, Hard=7-10)

**Impact:** Reduces friction (users know what they're committing to). Helps with planning study sessions.

---

#### 1.4: Make Streaks More Prominent

**Current:** Small pill in top-right of Topics screen

**Improved:** Large card at top of Topics screen

```
┌──────────────────────────────┐
│  🔥 5-DAY STREAK             │
│  Keep it going! +1 more      │
│  [Start now]                 │
└──────────────────────────────┘
```

**Implementation:**
- Move streak to top of Topics screen (above difficulty filter)
- Make it large and visually prominent (40px tall)
- Show next milestone (if 5-day streak, show "🎯 10-day streak in 5 days!")
- Add tap-to-start button

**Impact:** Loss aversion is powerful. Users will study to maintain streak. Daily active users increase.

---

#### 1.5: Add Animation to Saved Questions

**Current:** Saved questions are a boring list

**Improved:** Animated visual feedback when saving

```
User swipes right to save:
  → Heart bounces in (emoji scales up + rotates)
  → Toast notification: "Saved! 📚 5 in your list"
  → Button text changes to "Saved ✓"
```

**Implementation:**
- When `POST /saved` succeeds, trigger animation
- Use `react-native-reanimated` for smooth animation
- Show toast (not alert) for less-intrusive feedback
- Change button UI to show it's saved

**Impact:** Tactile satisfaction. Users feel their actions matter.

---

### TIER 2: Medium Effort (2-3 week sprint)

#### 2.1: Add Spaced Repetition

**Current:** Questions are randomly shuffled each time

**Improved:** Questions repeat on a schedule (newly saved → 1 day → 3 days → 7 days → 30 days)

**Why:** Scientifically proven to increase retention by 3-5x.

**Implementation:**
- Add `reviewSchedule` to SavedDoc: `{ nextReviewDate: ISO8601, interval: number, easeFactor: number }`
- On load, filter Saved questions to show only "due for review"
- After user answers, update interval (SM-2 algorithm or simplified version)

**Simplified version:**
```
If correct: nextReview = today + (2x previous interval)
If incorrect: nextReview = today + 1 day, interval = 1 day
```

**UI:**
- Show "Due Today: 8" on Saved tab
- Show review count badge on Saved tab icon

**Impact:** Transforms app from study tool → memory retention engine. Makes users return daily.

---

#### 2.2: Add Achievement Badges

**Current:** Only streak is gamified

**Improved:** Multiple achievements unlock

```
Examples:
- 🥉 "First Blood" — Save your first question
- 🟢 "Easy Rider" — Solve 5 Easy problems
- 🟡 "Medium Rare" — Solve 10 Medium problems
- 🔥 "On Fire" — 7-day streak
- 📚 "Completionist" — Solve all 42 problems in a category
- ⚡ "Speed Demon" — Solve problem in under 1 min
- 🧠 "Mastery" — Review same problem 5+ times and get correct
```

**Implementation:**
- Add achievements collection to MongoDB
- Track in progress.ts and update on each card completion
- Show achievements on Explore/About tab
- Show notification when achievement unlocks (with animation)

**Impact:** Highly engaging. Gives users goals beyond learning. Increases time in app.

---

#### 2.3: Redesign Saved Questions Screen

**Current:** Just a scrollable list

**Improved:** Tab between "Review Due" and "All Saved"

**Review Due tab:**
```
┌──────────────────────┐
│  Due Today: 8        │
│  ────────────────    │  (progress bar)
│                      │
│  Two Sum             │
│  Easy • Due now      │
│  [Review]            │
│                      │
│  (More problems...)  │
└──────────────────────┘
```

**All Saved tab:**
- Filtered by category/difficulty (same as Topics picker)
- Sort by: Recently Saved, Due Soonest, Difficulty
- Swipe-to-delete (with undo option)

**Implementation:**
- Add state for `filterBy: 'all' | 'due'`
- Add sort picker in top-right (modal)
- Replace delete alert with swipe-to-delete + undo toast

**Impact:** Makes Saved feel like a study tool, not just a list. Increases saved count and retention.

---

### TIER 3: Polish & Scale (3-4 week sprint)

#### 3.1: Add Onboarding Flow

**Current:** User opens app → Topics screen (no guidance)

**Improved:** First-time users see walkthrough

```
Screen 1:
"Learn by Swiping"
"Practice 450+ coding problems designed for interviews"
[Next]

Screen 2:
"Pick a Topic"
"Choose from Arrays, Linked Lists, Dynamic Programming..."
[Next]

Screen 3:
"Answer & Learn"
"Each problem has an AI-generated explanation"
[Next]

Screen 4:
"Save & Review"
"Bookmark problems you want to study more"
[Get Started]
```

**Implementation:**
- Add `hasSeenOnboarding` to AsyncStorage
- Show modal carousel on first launch
- Skip button on each screen
- Use react-native-carousel or react-native-snap-carousel

**Impact:** Reduces confusion. Increases feature discovery (saves, streaks). Better retention.

---

#### 3.2: Add Daily Notification

**Current:** No push notifications

**Improved:** Optional "Your streak is due!" push at 9 AM

**Implementation:**
- Use `expo-notifications`
- Request permission on onboarding
- Send push if DAU would be broken
- Personalize: "Your streak is on fire! 🔥 5 days in a row!"

**Impact:** Casual games (Duolingo) see 30-50% increase in DAU with notifications.

---

#### 3.3: Add Analytics (Privacy-First)

**Current:** No understanding of user behavior

**Improved:** Track (with explicit opt-in):
- Time spent per session
- Completion rate per category
- Save rate (how often users bookmark)
- Churn (30-day retention)

**Tool:** Use Segment + Posthog (self-hosted option available)

**What NOT to track:** User answers, specific problems solved (privacy-first)

**Impact:** Identify which problems/categories are confusing. Data-driven improvements.

---

## Color Palette Improvement

### Current Palette
- Grayscale, functional but dull
- Accent color is teal (safe but uninspiring)

### Recommended Palette (Inspired by Duolingo + Modern EdTech)
```
Primary:    #FF6B6B (Energetic red)
Accent:     #4ECDC4 (Teal, keep current)
Success:    #51CF66 (Green)
Warning:    #FFD93D (Yellow)
Danger:     #FF6B6B (Red)
Background: #FFFFFF (Light) / #121212 (Dark)
Text:       #2C3E50 (Light mode) / #E8E8E8 (Dark mode)
```

**Where to use:**
- Primary button: Use #FF6B6B (calls to action)
- Difficulty badges:
  - Easy: #51CF66 (green)
  - Medium: #FFD93D (yellow/orange)
  - Hard: #FF6B6B (red)
- Success state: #51CF66 (checkmark on correct answer)
- Streak: #FF6B6B (fire emoji + red text)

**Implementation:**
- Update `LeetSwipe/constants/colors.ts`
- Regenerate screenshots with new palette
- Test on light/dark mode

---

## Typography Improvements

### Current Issues
- Font sizes feel same everywhere (hard to scan)
- No visual hierarchy

### Improved Type Scale
```
Title (Topics, Saved): 28px, bold, leading 1.2
Section Label: 16px, bold, uppercase, gray
Card Title (Problem name): 18px, bold, leading 1.4
Body Text (Question): 16px, regular, leading 1.6
Caption (Time, difficulty): 13px, gray, medium
```

**Implementation:**
- Create type scale constants in `LeetSwipe/constants/typography.ts`
- Apply consistently across all screens

---

## Mobile-Specific Optimizations

### Current Issues
- Tablet layout not optimized
- Safe area insets not handled
- Small tap targets on some buttons

### Improvements

#### 1. Tablet Layout
```
iPad (768px+):
- Show 2-column grid for topics
- Increase card sizes
- Wider deck view (leave more whitespace)
```

**Implementation:**
```tsx
const isTablet = windowWidth > 768;
<FlatList 
  numColumns={isTablet ? 2 : 1}
  columnWrapperStyle={isTablet ? { gap: 12 } : undefined}
/>
```

#### 2. Safe Area + Notch Support
- Already using `react-native-safe-area-context`, good
- Verify on iPhone 12+ Pro Max (dynamic island)

#### 3. Tap Targets
- All buttons should be ≥44px × 44px (Apple HIG)
- Current card buttons look small; increase padding

**Code:**
```tsx
<Pressable style={styles.button}>
  {/* Ensure minHeight: 44, minWidth: 44 */}
</Pressable>
```

---

## Performance Optimizations

### Current Issues
- Questions list might be slow on first load
- Bundled deck (450 questions) takes a few seconds to parse

### Improvements

#### 1. Lazy Load Questions
```tsx
// Instead of loading all 450 at startup
const [questions, setQuestions] = useState([]);

// Load in batches:
useEffect(() => {
  const first50 = sample.questions.slice(0, 50);
  setQuestions(first50);
  
  // Load rest after 500ms
  setTimeout(() => {
    setQuestions(sample.questions);
  }, 500);
}, []);
```

#### 2. Memoize Topic Picker
```tsx
const TopicCard = React.memo(({ topic, onPress }) => {
  // Won't re-render unless props change
});
```

#### 3. Image Optimization
- Use `expo-image` instead of `Image` (better caching)
- Lazy-load category icons

---

## Accessibility Improvements

### Current Issues
- Some text lacks sufficient contrast
- No alt text for images/icons
- Screen reader support not tested

### Improvements

1. **Add accessibilityLabel to interactive elements**
   ```tsx
   <Pressable accessibilityLabel="Save this question" onPress={save}>
   ```

2. **Test with screen reader**
   - iOS: VoiceOver (Settings > Accessibility)
   - Android: TalkBack (Settings > Accessibility)

3. **Color contrast**
   - Use https://www.tinycolor.io/ to check contrast ratio
   - Ensure all text is WCAG AA compliant (4.5:1 for normal text)

---

## Summary: Implementation Roadmap

### Week 1-2 (TIER 1)
- [ ] Add confetti on correct answer
- [ ] Redesign topic picker cards
- [ ] Add time estimates
- [ ] Make streaks prominent
- [ ] Animate save feedback

### Week 3-4 (TIER 2)
- [ ] Implement spaced repetition
- [ ] Add achievement badges
- [ ] Redesign Saved screen

### Week 5-6 (TIER 3)
- [ ] Add onboarding flow
- [ ] Add push notifications
- [ ] Setup analytics

### Testing & Launch
- [ ] Gather 20 beta users (friends, Reddit)
- [ ] Collect feedback via Typeform
- [ ] Fix critical issues
- [ ] Polish screenshots & app store listing
- [ ] Submit to App Store & Play Store

---

## Expected Impact

| Improvement | Impact on DAU | Impact on Retention | Effort |
|-------------|---------------|--------------------|--------|
| Confetti + celebrations | +15% | +10% | 1 day |
| Better visual design | +20% | +5% | 3 days |
| Prominent streaks | +25% | +20% | 2 days |
| Spaced repetition | +10% | +50% | 5 days |
| Achievements | +30% | +25% | 5 days |
| Onboarding | +20% | +15% | 4 days |
| Notifications | +35% | +30% | 3 days |

**Conservative estimate:** 2.5-3x increase in DAU and 3-5x increase in retention after all improvements.

**Realistic timeline:** 4-6 weeks to implement all changes + testing.
