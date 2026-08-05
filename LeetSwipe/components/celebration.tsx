/**
 * A short burst of colour when an answer is right.
 *
 * Written with Animated rather than pulling in a confetti library: the effect is
 * a dozen dots on a parabola, the dependency would be larger than the code, and
 * this keeps the native driver end to end so the burst never competes with the
 * swipe gesture for the JS thread.
 *
 * Deliberately brief — about 900ms. Getting a question right should feel good,
 * not hold up the next card.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

const PIECE_COLORS = ['#2fbf71', '#4f9dff', '#ffb454', '#ff8fa3', '#b78bff'];
const PIECE_COUNT = 14;
const DURATION = 900;

interface Piece {
  angle: number;
  distance: number;
  size: number;
  color: string;
  delay: number;
  spin: number;
}

/** Fixed spread, jittered per piece, so bursts differ without looking random. */
function makePieces(): Piece[] {
  return Array.from({ length: PIECE_COUNT }, (_, i) => {
    const spread = (i / PIECE_COUNT) * Math.PI * 2;
    return {
      angle: spread + (Math.random() - 0.5) * 0.5,
      distance: 70 + Math.random() * 60,
      size: 6 + Math.random() * 5,
      color: PIECE_COLORS[i % PIECE_COLORS.length],
      delay: Math.random() * 90,
      spin: (Math.random() - 0.5) * 540,
    };
  });
}

function Piece({ piece, progress }: { piece: Piece; progress: Animated.Value }) {
  const travel = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.piece,
        {
          width: piece.size,
          height: piece.size,
          backgroundColor: piece.color,
          opacity: progress.interpolate({
            inputRange: [0, 0.15, 0.7, 1],
            outputRange: [0, 1, 1, 0],
          }),
          transform: [
            {
              translateX: travel.interpolate({
                inputRange: [0, 1],
                outputRange: [0, Math.cos(piece.angle) * piece.distance],
              }),
            },
            {
              // Gravity: pieces rise, then fall past where they started.
              translateY: travel.interpolate({
                inputRange: [0, 0.45, 1],
                outputRange: [
                  0,
                  Math.sin(piece.angle) * piece.distance - 26,
                  Math.sin(piece.angle) * piece.distance + 44,
                ],
              }),
            },
            {
              rotate: travel.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', `${piece.spin}deg`],
              }),
            },
            { scale: travel.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.4, 1, 0.7] }) },
          ],
        },
      ]}
    />
  );
}

interface Props {
  /** Flip to a new value to fire a burst. Null means nothing has happened yet. */
  trigger: number | null;
}

export function Celebration({ trigger }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const pieces = useMemo(makePieces, [trigger]);

  useEffect(() => {
    if (trigger == null) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: DURATION,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [trigger, progress]);

  if (trigger == null) return null;

  return (
    <View pointerEvents="none" style={styles.wrap}>
      {pieces.map((piece, i) => (
        <Piece key={`${trigger}-${i}`} piece={piece} progress={progress} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  piece: { position: 'absolute', borderRadius: 2 },
});
