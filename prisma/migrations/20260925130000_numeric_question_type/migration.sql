-- Numeric-answer questions: an MCQ whose correct option is a number can be
-- converted into a question the student answers with a value instead of a choice.
ALTER TYPE "QuestionType" ADD VALUE 'NUMERIC';
