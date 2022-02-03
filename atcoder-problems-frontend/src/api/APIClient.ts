import { fetchSubmissionsFromDatabaseAndServer } from "../database/SubmissionsDB";
import Contest, { isContest } from "../interfaces/Contest";
import { isContestParticipation } from "../interfaces/ContestParticipation";
import MergedProblem, { isMergedProblem } from "../interfaces/MergedProblem";
import Problem, { isProblem } from "../interfaces/Problem";
import ProblemModel, { isProblemModel } from "../interfaces/ProblemModel";
import {
  isRankingEntry,
  isSumRankingEntry,
  RankingEntry,
  SumRankingEntry,
} from "../interfaces/RankingEntry";
import {
  ContestId,
  ProblemId,
  ProblemIndex,
  UserId,
} from "../interfaces/Status";
import { isSubmission } from "../interfaces/Submission";
import { isUserRankEntry, UserRankEntry } from "../interfaces/UserRankEntry";
import { clipDifficulty, isValidResult } from "../utils";
import { toChunks } from "../utils/Chunk";
import { ratingInfoOf } from "../utils/RatingInfo";
import { hasPropertyAsType, isString } from "../utils/TypeUtils";
import { useSWRData } from "./index";

const STATIC_API_BASE_URL = "https://kenkoooo.com/atcoder/resources";
const PROXY_API_URL = "https://kenkoooo.com/atcoder/proxy";
const ATCODER_API_URL = process.env.REACT_APP_ATCODER_API_URL;

const generateRanking = (
  mergedProblemMap: Map<ProblemId, MergedProblem>,
  property: "fastest_user_id" | "shortest_user_id" | "first_user_id"
): RankingEntry[] => {
  const countByUser = Array.from(mergedProblemMap.values())
    .map((problem) => problem[property])
    .reduce((map, userId) => {
      if (userId) {
        map.set(userId, (map.get(userId) ?? 0) + 1);
      }
      return map;
    }, new Map<string, number>());

  return Array.from(countByUser.entries()).map(
    ([user_id, count]): RankingEntry => ({
      user_id,
      count,
    })
  );
};

function fetchTypedValue<T>(
  url: string,
  typeGuardFn: (obj: unknown) => obj is T
): Promise<T | undefined> {
  return fetch(url)
    .then((response) => response.json())
    .then((response: unknown) =>
      typeGuardFn(response) ? response : undefined
    );
}

function fetchTypedArray<T>(
  url: string,
  typeGuardFn: (obj: unknown) => obj is T
): Promise<T[]> {
  return fetch(url)
    .then((r) => r.json())
    .then((array: unknown[]) => array.filter(typeGuardFn));
}

const useRankingV3 = (url: string) => {
  return useSWRData(url, (u) =>
    fetchTypedArray<RankingEntry>(u, isRankingEntry)
  );
};

export const useACRanking = (from: number, to: number) => {
  const url = `${ATCODER_API_URL}/v3/ac_ranking?from=${from}&to=${to}`;
  return useRankingV3(url);
};

export const useUserACRank = (user: string) => {
  const url = `${ATCODER_API_URL}/v3/user/ac_rank?user=${encodeURIComponent(
    user
  )}`;
  return useSWRData(url, (url) =>
    fetchTypedValue<UserRankEntry>(url, isUserRankEntry)
  );
};

export const useStreakRanking = (from: number, to: number) => {
  const url = `${ATCODER_API_URL}/v3/streak_ranking?from=${from}&to=${to}`;
  return useRankingV3(url);
};

export const useUserStreakRank = (user: string) => {
  const url = `${ATCODER_API_URL}/v3/user/streak_rank?user=${encodeURIComponent(
    user
  )}`;
  return useSWRData(url, (url) =>
    fetchTypedValue<UserRankEntry>(url, isUserRankEntry)
  );
};

export const useSumRanking = (from: number, to: number) => {
  const fetcher = async (url: string) => {
    const ranking = await fetchTypedArray<SumRankingEntry>(
      url,
      isSumRankingEntry
    );
    return ranking.map((entry) => ({
      count: entry.point_sum,
      user_id: entry.user_id,
    }));
  };
  const url = `${ATCODER_API_URL}/v3/rated_point_sum_ranking?from=${from}&to=${to}`;
  return useSWRData(url, fetcher);
};

export const useUserSumRank = (user: string) => {
  const url = `${ATCODER_API_URL}/v3/user/rated_point_sum_rank?user=${encodeURIComponent(
    user
  )}`;
  return useSWRData(url, (url) =>
    fetchTypedValue<UserRankEntry>(url, isUserRankEntry)
  );
};

export const useMergedProblemMap = () => {
  const url = STATIC_API_BASE_URL + "/merged-problems.json";
  return useSWRData(url, (url) =>
    fetchTypedArray(url, isMergedProblem).then((problems) =>
      problems.reduce((map, problem) => {
        map.set(problem.id, problem);
        return map;
      }, new Map<ProblemId, MergedProblem>())
    )
  );
};

export const useLangList = () => {
  const url = `${ATCODER_API_URL}/v3/language_list`;
  return useSWRData(url, (url) => fetchTypedArray(url, isString));
};

export const useOneLangRanking = (
  from: number,
  to: number,
  language: string
) => {
  const url = `${ATCODER_API_URL}/v3/language_ranking?from=${from}&to=${to}&language=${encodeURIComponent(
    language
  )}`;
  return useRankingV3(url);
};

export const useShortRanking = () => {
  const map = useMergedProblemMap().data;
  return map ? generateRanking(map, "shortest_user_id") : undefined;
};
export const useFastRanking = () => {
  const map = useMergedProblemMap().data;
  return map ? generateRanking(map, "fastest_user_id") : undefined;
};
export const useFirstRanking = () => {
  const map = useMergedProblemMap().data;
  return map ? generateRanking(map, "first_user_id") : undefined;
};

export const useRatingInfo = (user: string) => {
  const url = `${PROXY_API_URL}/users/${user}/history/json`;
  const history =
    useSWRData(url, (url) => fetchTypedArray(url, isContestParticipation))
      ?.data ?? [];
  return ratingInfoOf(history);
};

export const useUserSubmission = (user: string) => {
  return useMultipleUserSubmissions([user]).data;
};

export const useMultipleUserSubmissions = (userIds: UserId[]) => {
  const fetcher = async (users: UserId[]) => {
    const promises = users.map((u) => fetchSubmissionsFromDatabaseAndServer(u));
    const arrays = await Promise.all(promises);
    return arrays.flat();
  };
  const users = userIds.join(",");
  return useSWRData(`multiple-user-submission ${users}`, (s) => {
    const users = s.split(" ")[1];
    return fetcher(users.split(","));
  });
};

export const useContests = () => {
  const url = STATIC_API_BASE_URL + "/contests.json";
  return useSWRData(url, (url) => fetchTypedArray(url, isContest));
};

export const useProblems = () => {
  const url = STATIC_API_BASE_URL + "/problems.json";
  return useSWRData(url, (url) => fetchTypedArray(url, isProblem)).data;
};

export const useContestToProblems = () => {
  const url = STATIC_API_BASE_URL + "/contest-problem.json";
  const contestIdToProblemIdArray = useSWRData(url, (url) =>
    fetchTypedArray(
      url,
      (
        obj
      ): obj is {
        contest_id: ContestId;
        problem_id: ProblemId;
        problem_index: ProblemIndex;
      } =>
        hasPropertyAsType(obj, "contest_id", isString) &&
        hasPropertyAsType(obj, "problem_id", isString) &&
        hasPropertyAsType(obj, "problem_index", isString)
    )
  );
  const problemMap = useProblemMap();
  return contestIdToProblemIdArray.data?.reduce(
    (map, { contest_id, problem_id, problem_index }) => {
      const problem = problemMap?.get(problem_id);
      if (problem) {
        const problems = map.get(contest_id) ?? [];
        problems.push({ ...problem, problem_index });
        map.set(contest_id, problems);
      }
      return map;
    },
    new Map<ContestId, Problem[]>()
  );
};

export const useContestToMergedProblems = () => {
  const url = STATIC_API_BASE_URL + "/contest-problem.json";
  const contestIdToProblemIdArray = useSWRData(url, (url) =>
    fetchTypedArray(
      url,
      (
        obj
      ): obj is {
        contest_id: ContestId;
        problem_id: ProblemId;
        problem_index: ProblemIndex;
      } =>
        hasPropertyAsType(obj, "contest_id", isString) &&
        hasPropertyAsType(obj, "problem_id", isString) &&
        hasPropertyAsType(obj, "problem_index", isString)
    )
  );
  const { data: problemMap } = useMergedProblemMap();
  return contestIdToProblemIdArray.data?.reduce(
    (map, { contest_id, problem_id, problem_index }) => {
      const problem = problemMap?.get(problem_id);
      if (problem) {
        const problems = map.get(contest_id) ?? [];
        problems.push({ ...problem, problem_index });
        map.set(contest_id, problems);
      }
      return map;
    },
    new Map<ContestId, MergedProblem[]>()
  );
};

export const useContestMap = () => {
  const contests = useContests().data;
  return contests?.reduce((map, contest) => {
    map.set(contest.id, contest);
    return map;
  }, new Map<ContestId, Contest>());
};

export const useProblemMap = () => {
  const problems = useProblems();
  return problems?.reduce((map, problem) => {
    map.set(problem.id, problem);
    return map;
  }, new Map<ProblemId, Problem>());
};

export const useProblemModelMap = () => {
  const fetcher = (url: string) =>
    fetch(url)
      .then((r) => r.json())
      .then((obj: { [p: string]: unknown }) =>
        Object.entries(obj)
          .filter((entry): entry is [string, ProblemModel] =>
            isProblemModel(entry[1])
          )
          .reduce((map, [problemId, problemModel]) => {
            if (problemModel.difficulty === undefined) {
              map.set(problemId, problemModel);
            } else {
              map.set(problemId, {
                ...problemModel,
                difficulty: clipDifficulty(problemModel.difficulty),
                rawDifficulty: problemModel.difficulty,
              });
            }
            return map;
          }, new Map<ProblemId, ProblemModel>())
      );
  const url = STATIC_API_BASE_URL + "/problem-models.json";
  return useSWRData(url, fetcher).data;
};

export const useVirtualContestSubmissions = (
  users: UserId[],
  problems: ProblemId[],
  fromSecond: number,
  toSecond: number,
  enableAutoRefresh: boolean
) => {
  const PROBLEM_CHUNK_SIZE = 10;
  const USER_CHUNK_SIZE = 10;
  const requestCount =
    Math.ceil(users.length / USER_CHUNK_SIZE) *
    Math.ceil(problems.length / PROBLEM_CHUNK_SIZE);

  const refreshInterval = enableAutoRefresh
    ? Math.max(1, requestCount / 10) * 60_000
    : 1_000_000_000;

  const userChunks = toChunks(users, USER_CHUNK_SIZE);
  const problemChunks = toChunks(problems, PROBLEM_CHUNK_SIZE);
  const singleFetch = async (users: UserId[], problems: ProblemId[]) => {
    const userList = users.join(",");
    const problemList = problems.join(",");
    const url = `${ATCODER_API_URL}/v3/users_and_time?users=${userList}&problems=${problemList}&from=${fromSecond}&to=${toSecond}`;
    const submissions = await fetchTypedArray(url, isSubmission);
    return submissions.filter((submission) => isValidResult(submission.result));
  };

  const fetcher = async () => {
    const promises = userChunks
      .flatMap((users) =>
        problemChunks.map((problems) => ({ users, problems }))
      )
      .map(({ users, problems }) => singleFetch(users, problems));
    const submissionChunks = await Promise.all(promises);
    return submissionChunks.flatMap((x) => x);
  };

  return useSWRData(
    "useVirtualContestSubmissions",
    () => (users.length > 0 ? fetcher() : Promise.resolve([])),
    {
      refreshInterval,
    }
  );
};

export const useRecentSubmissions = () => {
  const url = `${ATCODER_API_URL}/v3/recent`;
  return useSWRData(url, (url) => fetchTypedArray(url, isSubmission));
};
