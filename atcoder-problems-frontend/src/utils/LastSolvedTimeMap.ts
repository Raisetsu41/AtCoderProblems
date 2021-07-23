import { ProblemId } from "../interfaces/Status";
import Submission from "../interfaces/Submission";
import { isAccepted } from "./index";

export const ExcludeOptions = [
  "Exclude",
  "Exclude submitted",
  "6 Months",
  "4 Weeks",
  "2 Weeks",
  "1 Week",
  "Don't exclude",
] as const;
export type ExcludeOption = typeof ExcludeOptions[number];

export const isIncludedSolvedTIme = (
  problemId: string,
  excludeOption: ExcludeOption,
  currentSecond: number,
  lastSolvedTimeMap: Map<ProblemId, number>,
  submittedProblemIds: Set<ProblemId>
): boolean => {
  const lastSolvedTime = lastSolvedTimeMap.get(problemId);
  if (lastSolvedTime) {
    const seconds = currentSecond - lastSolvedTime;
    switch (excludeOption) {
      case "Exclude":
      case "Exclude submitted":
        return false;
      case "1 Week":
        return seconds > 3600 * 24 * 7;
      case "2 Weeks":
        return seconds > 3600 * 24 * 14;
      case "4 Weeks":
        return seconds > 3600 * 24 * 28;
      case "6 Months":
        return seconds > 3600 * 24 * 180;
      case "Don't exclude":
        return true;
    }
  }

  const isSubmitted = submittedProblemIds.has(problemId);
  if (excludeOption === "Exclude submitted") {
    return !isSubmitted;
  }
  return true;
};

export const getLastSolvedTimeMap = (userSubmissions: Submission[]) => {
  const lastSolvedTimeMap = new Map<ProblemId, number>();
  userSubmissions
    .filter((s) => isAccepted(s.result))
    .forEach((s) => {
      const cur = lastSolvedTimeMap.get(s.problem_id) ?? 0;
      lastSolvedTimeMap.set(s.problem_id, Math.max(s.epoch_second, cur));
    });
  return lastSolvedTimeMap;
};
