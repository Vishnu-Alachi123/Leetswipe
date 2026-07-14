import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// This is a Functional Component, the standard way to create screens.
const QuestionScreen = () => {
  return (
    // The main container for the screen.
    // The style 'container' ensures it takes up the full screen and centers its content.
    <View style={styles.container}>
      
      {/* The Text component is used to display the message. */}
      <Text style={styles.welcomeText}>
        Welcome to your first React Native App!
      </Text>

      {/* A smaller, secondary message */}
      <Text style={styles.subText}>
        Start editing to see changes.
      </Text>

    </View>
  );
};

// ----------------------------------------------------
// StyleSheet is the standard way to create styles in React Native.
const styles = StyleSheet.create({
  container: {
    // flex: 1 makes the container take up the entire screen space.
    flex: 1, 
    // justifyContent centers children vertically (along the main axis).
    justifyContent: 'center', 
    // alignItems centers children horizontally (along the cross axis).
    alignItems: 'center', 
    backgroundColor: '#f5f5f5', // Light gray background
    padding: 20,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: 10,
    textAlign: 'center',
  },
  subText: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
  },
});

export default QuestionScreen;