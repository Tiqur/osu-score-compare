import axios from 'axios';
import dotenv from 'dotenv';
import { Client } from 'pg';

interface BeatmapPlaycountDict {
  [key: number]: number;
}

interface Request {
  type: 'most_played',
  user_id: number,
  limit: number,
  offset: number
}


interface UserBeatmapPlaycount {
  user_id: number;
  beatmap_id: number;
  playcount: number;
}


interface Score {
  id: bigint;
  map_id: bigint;
  best_id: bigint;
  created_at: string; // timestamp with time zone
  user_id: bigint;
  max_combo: number;
  mode: string; // character varying(8)
  mode_int: number; // smallint
  mods: string[]; // character varying(2)[]
  passed: boolean;
  perfect: boolean;
  pp: number; // double precision
  rank: string; // character varying(2)
  score: bigint;
  count_50: number;
  count_100: number;
  count_300: number;
  count_katu: number;
  count_geki: number;
  count_miss: number;
}

// Read enviornment variables
dotenv.config();

// Constants
const API_URL = 'https://osu.ppy.sh/api/v2';
const OATH_TOKEN_URL = 'https://osu.ppy.sh/oauth/token';
const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;

// Set default headers
axios.defaults.headers.common['Accept'] = 'application/json';
axios.defaults.headers.common['Content-Type'] = 'application/json';

async function getUserOAUTHToken(): Promise<string> {
  const resp = await axios.post(OATH_TOKEN_URL, {
    client_id: client_id,
    client_secret: client_secret,
    grant_type: 'client_credentials',
    scope: 'public'
  });

  return resp.data.access_token;
}

async function getPlayedBeatmapCount(user_id: number, token: string): Promise<number> {
  const resp = await axios.get(`${API_URL}/users/${user_id}`, {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });
  return resp.data.beatmap_playcounts_count;
}

function createRequestQueue(user_id: number, played_beatmap_count: number): Request[] {
  const max_limit = 100;
  const request_queue: Request[] = [];
  
  // Create request queue with max response of 100 items
  for (let offset = 0; played_beatmap_count-offset > 0; offset+=max_limit) {
    const limit = Math.min(max_limit, played_beatmap_count-offset);

    request_queue.push({
      type: 'most_played',
      user_id: user_id,
      limit: limit,
      offset: offset
    });
  }

  return request_queue;
}

async function getAllUserScoresFromBeatmap(user_id: number, beatmap_id: bigint, token: string): Promise<Score[] | null> {
  try {
    const score_arr = [];
    const scores = (await axios.get(`${API_URL}/beatmaps/${beatmap_id}/scores/users/${user_id}/all`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    })).data.scores;

    for (const score of scores) {
      score_arr.push({
        id: score.id,
        map_id: beatmap_id,
        best_id: score.best_id,
        created_at: score.created_at,
        user_id: score.user_id,
        max_combo: score.max_combo,
        mode: score.mode,
        mode_int: score.mode_int,
        mods: score.mods,
        passed: score.passed,
        perfect: score.perfect,
        pp: score.pp,
        rank: score.rank,
        score: score.score,
        count_50: score.statistics.count_50,
        count_100: score.statistics.count_100,
        count_300: score.statistics.count_300,
        count_katu: score.statistics.count_katu,
        count_geki: score.statistics.count_geki,
        count_miss: score.statistics.count_miss
      });
    }

    return score_arr;
  } catch(err) {
    console.error(`No Leaderboard: ${beatmap_id}`);
    return null;
  }
}

async function getMostPlayedBeatmaps(request: Request, token: string): Promise<BeatmapPlaycountDict> {
  const dict: BeatmapPlaycountDict = {};
  const resp = await axios.get(`${API_URL}/users/${request.user_id}/beatmapsets/most_played?limit=${request.limit}&offset=${request.offset}`, {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });
  
  for (const map of resp.data) {
    dict[parseInt(map.beatmap_id)] = map.count;
  }

  return dict;
}

async function getPlayedBeatmapDict(request_queue: Request[], token: string): Promise<BeatmapPlaycountDict> {
  let beatmap_playcount_dict: BeatmapPlaycountDict = {};

  const promises = request_queue.map(async (r, index) => {
    return new Promise(resolve => {
      setTimeout(async () => {
        console.log(r);
        const res = await getMostPlayedBeatmaps(r, token);
        Object.assign(beatmap_playcount_dict, res);
        resolve(null);
      }, index*100)
    })
  });
  await Promise.all(promises);
  return beatmap_playcount_dict;
}

async function insertUserScore(client: Client, score: Score) {
  console.log(`Inserting scores for map_id: ${score.map_id}`);
  let modsArray = score.mods.length ? `ARRAY[${score.mods.map(mod => `'${mod}'`).join(', ')}]` : 'ARRAY[]';
  await client.query(`
    INSERT INTO scores 
    (id, map_id, best_id, created_at, user_id, max_combo, mode, mode_int, mods, passed, perfect, pp, rank, score, count_50, count_100, count_300, count_katu, count_geki, count_miss) VALUES
    (${score.id}, ${score.map_id}, ${score.best_id}, '${score.created_at}', ${score.user_id}, ${score.max_combo}, '${score.mode}', ${score.mode_int}, ARRAY[${modsArray}]::varchar(2)[], ${score.passed}, ${score.perfect}, ${score.pp}, '${score.rank}', ${score.score}, ${score.count_50}, ${score.count_100}, ${score.count_300}, ${score.count_katu}, ${score.count_geki}, ${score.count_miss});
  `);
}

async function insertBeatmap(client: Client, user_id: bigint, beatmap_id: number, playcount: number) {
  console.log(`Inserting beatmap for map_id: ${beatmap_id}`);
  await client.query(`
    INSERT INTO user_beatmap_playcount 
    (user_id, beatmap_id, playcount) VALUES
    (${user_id}, ${beatmap_id}, ${playcount});
  `);
}

async function insertAllUserScores(client: Client, user_id: number, map_dict: BeatmapPlaycountDict, token: string) {
  const promises = [];
  let index = 0;

  for (const key in map_dict) {
    const map_id = BigInt(parseInt(key));
    const play_count = map_dict[key];

    await insertBeatmap(client, map_id ,user_id, play_count);

    // Do some logic here later on to determine if we should fetch scores ( if playcount has changed )
    if (true) {
      promises.push(new Promise(resolve => {
        setTimeout(async () => {
          const scoreArr = await getAllUserScoresFromBeatmap(user_id, map_id, token);

          // Later on insert multiple scores at once
          if (scoreArr != null)
            for (const score of scoreArr)
              await insertUserScore(client, score);

          resolve(null);
        }, (index++)*100)
      }))
    }
  }

  await Promise.all(promises);
}

(async () => {
  
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'osu_score_compare',
    user: 'admin',
    password: 'admin' // Just for testing
  });

  await client.connect();

  // Create user_beatmap_playcount table
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_beatmap_playcount (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      beatmap_id INTEGER NOT NULL,
      playcount INTEGER NOT NULL
    );
  `);

  // Create scores table
  await client.query(`
    CREATE TABLE IF NOT EXISTS scores  (
      id BIGINT UNIQUE NOT NULL,
      map_id BIGINT NOT NULL,
      best_id BIGINT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL,
      user_id BIGINT NOT NULL,
      max_combo INTEGER NOT NULL,
      mode VARCHAR(8) NOT NULL,
      mode_int SMALLINT NOT NULL,
      mods VARCHAR(2)[] NOT NULL,
      passed BOOLEAN NOT NULL,
      perfect BOOLEAN NOT NULL,
      pp DOUBLE PRECISION NOT NULL,
      rank VARCHAR(2) NOT NULL,
      score BIGINT NOT NULL,
      count_50 INTEGER NOT NULL,
      count_100 INTEGER NOT NULL,
      count_300 INTEGER NOT NULL,
      count_katu INTEGER NOT NULL,
      count_geki INTEGER NOT NULL,
      count_miss INTEGER NOT NULL
    );
  `);

//  await client.query(`
//    INSERT INTO scores 
//    (id, map_id, best_id, created_at, user_id, max_combo, mode, mode_int, mods, passed, perfect, pp, rank, score, count_50, count_100, count_300, count_katu, count_geki, count_miss) VALUES
//    (1, 2819013, 2, '2023-04-20 10:00:00+00', 1234, 300, 'osu', 1, ARRAY['dt', 'hr'], true, false, 400.5, 'A', 1000000, 50, 100, 150, 10, 5, 2);
//  `);
  

  const user_id = 18225483;
  const token = await getUserOAUTHToken();
  const played_beatmap_count = await getPlayedBeatmapCount(user_id, token);

  // Since we will be making a lot of requests, it makes sense to queue them
  const request_queue = createRequestQueue(user_id, played_beatmap_count);

  // Return dictionary of ids ( key ) and play_count ( so it can be cached and compared against in future requests to determin if we should requst more user scores for that particular beatmap )
  const beatmap_dict = await getPlayedBeatmapDict(request_queue, token);

  await insertAllUserScores(client, user_id, beatmap_dict, token);
  console.log("Done!");
  //console.log(scores);
  
  //console.log(await getAllUserScoresFromBeatmap(user_id, BigInt(252238), token));


  //console.log(played_map_ids, played_map_ids.length);
})()

