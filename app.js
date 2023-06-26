const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();

app.use(express.json());
let database = null;

const initializeDBandServer = async () => {
  try {
    database = await open({
      filename: path.join(__dirname, "twitterClone.db"),
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`Database error is ${error.message}`);
    process.exit(1);
  }
};

initializeDBandServer();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;

  //scenario 1
  const checkUserDetails = `select * from user where username='${username}';`;

  const dbUser = await database.get(checkUserDetails);

  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const getHashedPassword = await bcrypt.hash(password, 10);
      const requestPassword = `insert into user( username, password, name, gender) values(
          '${name}','${username}','${getHashedPassword}','${gender}');`;
      await database.run(requestPassword);

      response.status(200);
      response.send("User created successfully");
    }
  }
});

// API 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUser = `select * from user where username='${username}';`;
  const dbUserExist = await database.get(checkUser);
  if (dbUserExist !== undefined) {
    const checkPassword = await bcrypt.compare(password, dbUserExist.password);
    if (checkPassword === true) {
      const payload = { username, userId: dbUserExist.user_id };
      const jwtToken = jwt.sign(payload, "SECRET_KEY");
      response.send({ jwtToken });
      console.log(jwtToken);
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

// Authentication Token

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRET_KEY", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.userId = payload.userId;
        next();
      }
    });
  }
};

// User Followers

const userFollowerId = async (username) => {
  const getFollowersQuery = `
    select 
    following_user_id from follower
    inner join 
    user on user.user_id = follower.follower_user_id
    where user.username='${username}';`;

  const followingPeople = await database.all(getFollowersQuery);
  const listOfIds = followingPeople.map(
    (eachFollower) => eachFollower.following_user_id
  );
  return listOfIds;
};

// API 3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;

  const followersIds = await userFollowerId(username);

  const getTweetsQuery = `select username,tweet,date_time as dateTime
    From 
    user
    inner join tweet on user.user_id = tweet.user_id
    where
    user.user_id in (${followerIds})
    order by date_time desc limit 4; `;

  const tweets = await database.all(getTweetsQuery);
  response.send(tweets);
});

// API 4

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username, userId } = request;

  const getFollowingPeoplesQuery = `select name from follower 
    inner join user
    on 
    user.user_id = follower.following_user_id
    where follower_user_id = '${userId}';`;

  const followingPeople = await database.all(getFollowingPeoplesQuery);
  response.send(followingPeople);
});

//API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username, userId } = request;

  const getFollowersQuery = `select  distinct name from follower 
    inner join user on user.user_id = follower.follower_user_id
    where following_user_id = '${userId}';`;

  const followers = await database.all(getFollowersQuery);
  response.send(followers);
});

// Tweet Access

const tweetAccess = async (request, response) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getTweetsQuery = `select
    * from tweet inner join follower
    on tweet.user_id = follower.following_user_id
    where tweet.tweet_id = '${tweetId}' and follower_user_id = '${userId}';`;

  const tweet = await database.get(getTweetsQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

// API 6

app.get(
  "/tweets/:tweetId/",
  authenticateToken,
  tweetAccess,
  async (request, response) => {
    const { username, userId } = request;
    const { tweetId } = request.params;
    const getTweetQuery = `select tweet,
    (select count() from like where tweet_id = '${tweetId}') as likes,
    (select count() from reply where tweet_id = '${tweetId}') as replies,
    date_time as dateTime
    from tweet
    where tweet.tweet_id = '${tweetId}';
    `;
    const tweet = await database.get(getTweetQuery);
    response.send(tweet);
  }
);

// API 7

app.get(
  "/tweets/:tweetId/likes",
  authenticateToken,
  tweetAccess,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikesQuery = `select username 
    from user inner join likes on user.user_id = likes.user_id
    where tweet_id = '${tweetId}';
    `;
    const likedUsers = await database.get(getLikesQuery);
    const userList = likedUsers.map((eachUser) => eachUser.username);

    response.send({ likes: userList });
  }
);

// API 8

app.get(
  "/tweets/:tweetId/replies",
  authenticateToken,
  tweetAccess,
  async (request, response) => {
    const { tweetId } = request.params;
    const getRepliesQuery = `select name,reply
    from
    user inner join reply on user.user_id = reply.user_id
    where tweet_id = '${tweetId}';
    `;
    const repliedUsers = await database.all(getRepliesQuery);

    response.send({ replies: repliedUsers });
  }
);

// API 9

app.get(
  "user/tweets/",
  authenticateToken,
  tweetAccess,
  async (request, response) => {
    const { userId } = request;
    const getTweetsQuery = `select tweet,
    count(distinct like_id) as likes,
    count(distinct reply_id) as replies,
    date_time as dateTime
    from tweet left join reply on tweet.tweet_id = reply.tweet_id
    left join like on tweet.tweet_id = like.tweet_id
    where tweet.user_id = ${userId}
    group by tweet.tweet_id;
    `;
    const tweets = await database.all(getTweetsQuery);

    response.send(tweets);
  }
);

// API 10

app.get("/user/tweets", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const userId = parseInt(request.userId);
  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");
  const tweetQuery = `insert into tweet(tweet,user_id,date_time) values('${tweet}','${userId}'${dateTime}')`;
  await database.run(tweetQuery);
  response.send("Created a Tweet");
});

// API 11

app.delete("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { userId } = request;

  const getTweetQuery = `select * from 
    where 
    user_id = '${userId}' and tweet_id = '${tweetId}';`;

  const tweet = await database.get(getTweetQuery);

  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deleteTweetQuery = `delete from tweet where tweet_id = '${tweetId}';`;
    await database.run(deleteTweetQuery);
    response.send("Tweet Removed");
  }
});

module.exports = app;
