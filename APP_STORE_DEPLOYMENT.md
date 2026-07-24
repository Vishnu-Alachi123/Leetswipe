# LeetSwipe — App Store & Play Store Deployment Guide

Complete step-by-step instructions for building, submitting, and publishing LeetSwipe to Apple App Store and Google Play Store.

## Prerequisites & Setup

### 1. Developer Accounts (One-Time Cost)

**Apple Developer Program:**
- Cost: $99/year
- Required for: iOS/tvOS app distribution
- Sign up: https://developer.apple.com/programs/
- Time to approval: ~24-48 hours

**Google Play Developer:**
- Cost: $25 (one-time registration fee)
- Required for: Android app distribution
- Sign up: https://play.google.com/console
- Time to approval: Usually a few hours, can be up to 24 hours for first submission

### 2. Environment Setup

```bash
# Install EAS CLI (if not already installed)
npm install -g eas-cli

# Log in with your Expo account (create one at https://expo.dev if needed)
eas login

# Verify setup
eas whoami
```

### 3. App Configuration

Verify these are already set in `LeetSwipe/app.json`:
```json
{
  "expo": {
    "name": "LeetSwipe",
    "slug": "LeetSwipe",
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.vishnualachi.leetswipe",
      "supportsTablet": true
    },
    "android": {
      "package": "com.vishnualachi.leetswipe"
    }
  }
}
```

---

## iOS App Store Submission (Apple)

### Step 1: Create App in App Store Connect

1. Go to https://appstoreconnect.apple.com/
2. Click "My Apps" → "+" → "New App"
3. Fill in:
   - **Platform:** iOS
   - **App Name:** LeetSwipe
   - **Bundle ID:** com.vishnualachi.leetswipe (must match app.json)
   - **SKU:** Any unique identifier (e.g., `leetswipe-2024`)
   - **Full Access:** Select

### Step 2: Build for iOS

```bash
cd LeetSwipe

# Create a production build
eas build --platform ios --profile production

# For TestFlight testing first (recommended):
eas build --platform ios --profile production --wait
```

**First time setup will prompt for:**
- Apple Team ID (from Apple Developer account)
- App Signing Certificate (EAS will help create)
- Provisioning Profile (EAS will create)

### Step 3: Submit to App Store

```bash
# After build completes, submit to App Store
eas submit --platform ios --latest

# Or submit a specific build:
# eas submit --platform ios --id <BUILD_ID>
```

**You'll be prompted for:**
- App Store Connect credentials
- Submission info (release notes, version info)

### Step 4: Complete App Store Connect Metadata

Back in App Store Connect, fill in:

**General Information:**
- Description: "Swipe-style app for practicing LeetCode problems with AI-generated questions covering NeetCode-150"
- Keywords: interview prep, coding, LeetCode, algorithm, practice
- Support URL: https://github.com/Vishnu-Alachi123/Leetswipe
- Privacy Policy URL: (required — create one or use a template)

**Pricing & Availability:**
- Price Tier: Free
- Available in all territories (or select specific ones)

**App Preview & Screenshots:**
- Must provide 2-5 screenshots (iPad too if targeting tablets)
- Recommended sizes:
  - iPhone 6.7": 1290 × 2796 px
  - iPad 12.9": 2048 × 2732 px
- Add captions describing key features

**App Metadata:**
- Category: Education (or Games)
- Content Rating Questionnaire: Fill out (just basic questions)
- Age Rating: 4+ (coding practice, no adult content)

**Build:**
- Select your submitted build
- Add Version Release Notes

### Step 5: Submit for Review

- Click "Submit for Review"
- Apple reviews typically within 24-48 hours
- Most commonly rejected for:
  - Missing privacy policy
  - Unclear functionality
  - Crashes during testing
  - Misleading screenshots

---

## Android Google Play Submission

### Step 1: Create App in Google Play Console

1. Go to https://play.google.com/console/
2. Click "Create app"
3. Fill in:
   - **App name:** LeetSwipe
   - **Default language:** English
   - **App category:** Education
   - **Type:** Application (not game)
   - **Content rating:** Complete questionnaire

### Step 2: Build for Android

```bash
cd LeetSwipe

# Create production build (generates .aab for store)
eas build --platform android --profile production

# Wait for build to complete:
eas build --platform android --profile production --wait

# (First time will prompt for signing credentials; EAS handles this)
```

### Step 3: Generate Upload Key (First Time Only)

If EAS didn't create one automatically:

```bash
# EAS can create signing credentials for you
eas build:configure --platform android
```

Save the upload key safely — Google Play requires the same key for all updates.

### Step 4: Submit to Google Play

```bash
# Submit the .aab build to production
eas submit --platform android --latest

# Or specific build:
# eas submit --platform android --id <BUILD_ID>
```

**You'll be prompted for:**
- Google Play Console credentials
- Release track (Internal Testing → Closed Testing → Production)
- Release notes

### Step 5: Complete Play Store Listing

In Google Play Console:

**App information:**
- Short description (80 chars): "AI-powered interview prep with 450+ problems"
- Full description: Highlight features:
  - Swipe-style card interface
  - 450+ AI-generated problems
  - NeetCode-150 curriculum
  - Offline playable
  - Save and review mode
  - Progress tracking

**Graphics & Screenshots:**
- Phone screenshots (at least 2):
  - 1080 × 1920 px (recommended)
  - Must show core features (swipe, save, topics)
- Feature graphic:
  - 1024 × 500 px
  - High-level value proposition

**Content Rating:**
- Complete questionnaire (usually straightforward for coding apps)
- Rating: Unrated or Everyone

**Pricing & Distribution:**
- Free
- Supported countries: All (or select)
- Require targeting content rating

**Release:**
- Internal Testing first (5-50 testers)
- Then Closed Testing
- Finally Production

### Step 6: Submit for Review

1. Click "Submit app for review"
2. Google typically approves within 2-4 hours
3. Most common issues:
   - Crashes on launch
   - Broken features
   - Policy violations

---

## Testing Before Submission

### Local Testing (Before Build)

```bash
# Test on simulator/emulator
cd LeetSwipe
npx expo start

# Or build a preview APK/IPA to test on real device:
eas build --platform android --profile preview  # Creates .apk
eas build --platform ios --profile preview      # Creates .ipa
```

### TestFlight (iOS) / Internal Testing (Android)

**iOS TestFlight:**
```bash
# Build production iOS build, then in App Store Connect:
# 1. Select build
# 2. Go to TestFlight tab
# 3. Add internal testers (your email)
# 4. Share link to external testers

# External testing requires App Store review first
```

**Android Internal Testing:**
```bash
# Same as iOS — submit build to "Internal Testing" track
# Share internal test link via Play Console
# Testers don't need Google Play access
```

### Pre-Submission Checklist

- [ ] App launches without crashes
- [ ] All tabs/screens work (Topics, Deck, Saved, About)
- [ ] Offline mode works (bundled deck loads)
- [ ] Streak tracking works
- [ ] Save/unsave questions works
- [ ] Dark mode looks good
- [ ] Tablet layout works (iOS)
- [ ] Screenshots are polished and accurate
- [ ] Privacy policy is linked
- [ ] Permissions justified (none required for current version)

---

## Post-Submission Checklist

### Monitoring After Launch

```bash
# Check reviews on both platforms daily first week
# Use Expo Dashboard to monitor crashes:
https://expo.dev/apps

# Monitor App Store Connect / Play Console for:
- Crash reports
- Negative reviews
- User feedback
```

### Version Updates

To push a new version:

```bash
# 1. Update version in app.json and eas.json
{
  "version": "1.1.0"
}

# 2. Build and submit:
eas build --platform ios --profile production && eas submit --platform ios
eas build --platform android --profile production && eas submit --platform android

# 3. Monitor for reviews
```

---

## Troubleshooting Common Issues

### Build Fails with "Provisioning Profile" Error (iOS)
```bash
# Regenerate signing credentials
eas build:configure --platform ios
# Then rebuild
eas build --platform ios --profile production
```

### "Bundle ID doesn't match" Error
- Verify `bundleIdentifier` in `app.json` matches App Store Connect
- Cannot change after first submission; revert and rebuild if needed

### Android Build Takes 20+ Minutes
- Normal first time; subsequent builds cache dependencies
- Can submit to beta/staging track while waiting for production

### App Rejected: "Unclear Functionality"
- Ensure screenshots clearly show swiping mechanism
- Add 1-2 second demo videos in preview section (if supported)
- Write clear, feature-focused description

### Crash on Device but Not Simulator
- Often async issues or missing bundled assets
- Test on actual device before submitting:
  ```bash
  eas build --platform ios --profile preview --wait
  # Download .ipa and install via TestFlight or Xcode
  ```

---

## Maintenance & Updates

### Post-Launch Schedule

**Week 1:** Monitor crashes, fix critical bugs
**Month 1:** Gather reviews, improve UI based on feedback
**Quarterly:** Add new features (spaced repetition, custom decks, etc.)

### Feature Ideas for Updates

- **v1.1:** Spaced repetition scheduling
- **v1.2:** Custom problem sets / import
- **v1.3:** Social features (share decks, leaderboard)
- **v2.0:** Live explanations with Claude API

---

## Cost Summary

| Item | Cost | Frequency |
|------|------|-----------|
| Apple Developer Program | $99 | Yearly |
| Google Play Signup | $25 | One-time |
| Expo EAS Build (free tier) | $0 | Build cost included |
| Custom domain (optional) | $10-15 | Yearly |
| **Total (minimal)** | **$124-139** | **Yearly** |

---

## Resources

- **Expo Submit Documentation:** https://docs.expo.dev/submit/
- **App Store Connect Help:** https://help.apple.com/app-store-connect/
- **Google Play Console Help:** https://support.google.com/googleplay/android-developer/
- **Apple App Review Guidelines:** https://developer.apple.com/app-store/review/guidelines/
- **Google Play Policies:** https://play.google.com/about/developer-content-policy/
