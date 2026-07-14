TASK1 = """
Generate five challenging multiple-choice questions (MCQs) that test deep algorithmic thinking and problem-solving strategies based on the provided coding problem. Follow these guidelines:

1. Questions must be standalone and not depend on knowing the exact problem statement. They should abstract the problem into general algorithmic reasoning (e.g., efficiency, tradeoffs, data structure selection, optimization, edge cases).
2. Focus on *higher-order problem-solving skills*: choosing between brute force vs. optimized approaches, analyzing time/space complexity, handling constraints, and recognizing when advanced techniques (hashing, sorting, binary search, greedy methods, dynamic programming, etc.) are applicable.
3. Each question should emphasize **critical decision points** a programmer faces when designing a solution — e.g., "What data structure ensures efficient lookups here?" or "How would scaling the input size affect your algorithm?"
4. Keep them **non-trivial**: avoid simple recall questions. Instead, test whether the learner can generalize strategies, avoid common pitfalls, and reason about algorithmic choices.
5. Each MCQ must have four options (A-D), with one correct answer. The incorrect options should be plausible but reveal misconceptions or naive approaches.
6. Provide a **concise explanation** for the correct answer that connects directly to problem-solving insight (why this choice is efficient, scalable, or robust).
7. Ensure the difficulty matches that of typical LeetCode problems (easy/medium/hard depending on context). Questions should feel like stepping stones toward solving the actual problem efficiently.

Format:

Questionsid: 
topics: 
**Question 1: [Topic/Concept]**

[Question text — concise, thought-provoking]

A) [Option 1]  
B) [Option 2]  
C) [Option 3]  
D) [Option 4]  

**Correct Answer:** [Letter]  
**Explanation:** [Reasoning focused on algorithmic decision-making]

"""

TASK2 = """
Take the question generated previously, and check whether the options and the answer are correct. 
Check whether solution and explanation are valid and correct. Return the correct questions, options and answers"""

TASK3 = """
Generate five challenging multiple-choice questions (MCQs) that test deep algorithmic thinking and problem-solving strategies based on the provided coding problem. Follow these guidelines:

1. Questions must be standalone and not depend on knowing the exact problem statement. They should abstract the problem into general algorithmic reasoning (e.g., efficiency, tradeoffs, data structure selection, optimization, edge cases).
2. Focus on *higher-order problem-solving skills*: choosing between brute force vs. optimized approaches, analyzing time/space complexity, handling constraints, and recognizing when advanced techniques (hashing, sorting, binary search, greedy methods, dynamic programming, etc.) are applicable.
3. Each question should emphasize **critical decision points** a programmer faces when designing a solution — e.g., "What data structure ensures efficient lookups here?" or "How would scaling the input size affect your algorithm?"
4. Keep them **non-trivial**: avoid simple recall questions. Instead, test whether the learner can generalize strategies, avoid common pitfalls, and reason about algorithmic choices.
5. Each MCQ must have four options, with one correct answer. The incorrect options should be plausible but reveal misconceptions or naive approaches.
6. Provide a **concise explanation** for the correct answer that connects directly to problem-solving insight (why this choice is efficient, scalable, or robust).
7. Ensure the difficulty matches that of typical LeetCode problems (easy/medium/hard depending on context). Questions should feel like stepping stones toward solving the actual problem efficiently.


Format:
LeetQuestionId: Same as questonId from the input
Questionsid:  LeetQuestionId + (A/B/C/D/E), eg: for leetQuestionId = 1, Questionsid = 1A, 1B, 1C, 1D, 1E
Title: Appropriate title for the question
topics: (topic tags from the input)
Question: [Question text — concise, thought-provoking]
options: [option1, option2, option3, option4]
Answer: [index of the correct option (0-3)]
Explanation: [Reasoning focused on algorithmic decision-making]

"""

TASK4 = """
Generate five challenging multiple-choice questions (MCQs) that test deep algorithmic thinking and problem-solving strategies based on the provided coding problem. Follow these guidelines:

1. Questions must build up to answer the main question. First questions should ask about understanding the problem, then about possible approaches, then about optimizations, and finally about edge cases and trade-offs. Each question should scaffold the learner's thinking toward solving the overall problem.
2. Focus on *higher-order problem-solving skills*
3. Each question should emphasize **critical decision points** a programmer faces when designing a solution — e.g., "What data structure ensures efficient lookups here?" or "How would scaling the input size affect your algorithm?"
4. Keep them **non-trivial**: avoid simple recall questions. Instead, test whether the learner can generalize strategies, avoid common pitfalls, and reason about algorithmic choices.
5. Each MCQ must have four options, with one correct answer. The incorrect options should be plausible but reveal misconceptions or naive approaches.
6. Provide a **concise explanation** for the correct answer that connects directly to problem-solving insight (why this choice is efficient, scalable, or robust).
7. Ensure the difficulty matches that of typical LeetCode problems (easy/medium/hard depending on context). Questions should feel like stepping stones toward solving the actual problem efficiently.


Format:
LeetQuestionId: Same as questonId from the input
Questionsid:  LeetQuestionId + (A/B/C/D/E), eg: for leetQuestionId = 1, Questionsid = 1A, 1B, 1C, 1D, 1E
Title: Appropriate title for the question
topics: (topic tags from the input)
Question: [Question text — concise, thought-provoking]
options: [option1, option2, option3, option4]
Answer: [index of the correct option (0-3)]
Explanation: [Reasoning focused on algorithmic decision-making]

"""