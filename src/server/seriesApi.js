const express = require('express');
const router = express.Router();
const mysql = require('mysql');
//database configuration
const config = require('../db/db_config.js');
const db = config.database;
const url = require('url');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const theMovieDb = require('../themoviedb/themoviedb');
const configUser = require('./config');
const con = mysql.createConnection({user: db.user, password: db.password, host: db.host, database: db.database});
con.connect();

//get the list of all shows
router.get("/all_shows", function (req, res) {
    var sql = "SELECT series_name, votes, (score/votes) AS rating FROM all_series;";
    con.query(sql,  function (err, result) {
        if (err)
            throw (err);
        else {
            res.send(JSON.stringify(result));
        }
    });
});

//get the list of all comments for a show
router.get("/comments", function (req, res) {
    var q = url.parse(req.url, true).query;
    var name = q.showname;
    var sql = "SELECT comment_id, comment, username FROM comments, users " +
        "WHERE series_id=(SELECT series_id FROM all_series WHERE series_name=?) " +
        "AND username=(SELECT username from users WHERE user_id=comments.user_id);";
    con.query(sql, [name],function (err, result) {
        if (err)
            throw (err);
        else {
            res.send(JSON.stringify(result));
        }
    });
});

//add a comment
router.get("/addcomment", function (req, res) {
    var q = url.parse(req.url, true).query;
    var name = q.showname;
    var username = q.username;
    var comment = q.comment;
    var sql = "INSERT INTO comments (series_id, comment, user_id) VALUES\n" +
        "((SELECT series_id FROM all_series WHERE series_name=?),(?),\n" +
        "(SELECT user_id FROM users WHERE username=?));";
    con.query(sql, [name, comment, username],function (err, result) {
        if (err)
            throw (err);
        else {
            res.send("comment added");
        }
    });
});

//get recommendations according to the genre and rating, only shows that are not in user's own table
router.get("/recommend", function (req, res) {
    var q = url.parse(req.url, true).query;
    var username = q.username;
    var genre = q.genre;
    var sql = "SELECT series_name, votes, (score/votes) AS rating from all_series  " +
        "WHERE (score/votes>2) AND(genre2=? OR genre1=? OR genre3=? OR genre4=? OR genre5=?) " +
        "AND all_series.series_id NOT IN (SELECT series_id FROM ??);";
    con.query(sql, [genre, genre, genre, genre, genre, username],function (err, result) {
        if (err)
            throw (err);
        else {
            res.send(JSON.stringify(result));
        }
    });
});

//details of one show
router.get("/show", function (req,res){
    var q = url.parse(req.url, true).query;
    var showname = q.series_name;
    var sql="SELECT s.series_name, g1.genre_name as genre_name1, g2.genre_name as genre_name2, g3.genre_name as genre_name3, " +
        "g4.genre_name as genre_name4, g5.genre_name as genre_name5, s.votes, (s.score/s.votes) AS rating " +
        "FROM all_series AS s LEFT JOIN genre AS g1 ON s.genre1=g1.genre_id LEFT JOIN genre AS g2 " +
        "ON s.genre2=g2.genre_id LEFT JOIN genre AS g3 ON s.genre3=g3.genre_id LEFT JOIN genre AS g4 " +
        "ON s.genre4=g4.genre_id  LEFT JOIN genre AS g5 ON s.genre5=g5.genre_id WHERE s.series_name=?;" ;
    con.query(sql, [showname], function (err, result) {
        if (err)
            throw (err);
        else {
            res.send(JSON.stringify(result));
        }
    });
});

//add a series to the user's table
router.get("/addseries", function (req, res) {
    var q = url.parse(req.url, true).query;
    var name = q.showname;
    var user = q.username;
    var genres = [];
    var seriesID = -1;
    //check if the series is already on the user's table
    var sql = "SELECT series_id FROM ?? WHERE series_id=(SELECT series_id FROM all_series WHERE series_name=?);";
    con.query(sql, [user, name], function (err ,result) {
        if (result) {
            if (result.length > 0) {
                res.end("already on list");
            } else {
                var sql = "SELECT series_id FROM all_series WHERE series_name=?";
                //check if the series is already in the database
                con.query(sql, [name], function (err, result) {
                    if (result) {
                        if (result.length > 0) {
                            seriesID = result[0].series_id;
                            //if it is, add it directly to the user's table
                            addSeries(user, seriesID);
                        } else {
                            //if it isn't, search the MovieDb for a series of that name
                            theMovieDb.search.getTv({"query": name}, function showSeries(data) {
                                data = JSON.parse(data);
                                if (data.total_results === 0) {
                                    res.end("series not found");
                                } else {
                                    genres = data.results[0].genre_ids;
                                    var sql2 = "";
                                    //check the number of genres, then add series to the all_series table in the database and the user's own table
                                    if (genres.length === 1) {
                                        sql2 = "INSERT INTO all_series (series_name, genre1) VALUES (?,?)";
                                        con.query(sql2, [name, genres[0]], function(err, result) {
                                            if (err) throw err;
                                            seriesID = result.insertId;
                                            addSeries(user, seriesID);
                                        });
                                    } else if (genres.length === 2) {
                                        sql2 = "INSERT INTO all_series (series_name, genre1, genre2) VALUES (?,?,?)";
                                        con.query(sql2, [name, genres[0], genres[1]], function(err, result) {
                                            if (err) throw err;
                                            seriesID = result.insertId;
                                            addSeries(user, seriesID);
                                        });
                                    } else if (genres.length === 3) {
                                        sql2 = "INSERT INTO all_series (series_name, genre1, genre2, genre3) VALUES (?,?,?,?)";
                                        con.query(sql2, [name, genres[0], genres[1], genres[2]], function(err, result) {
                                            if (err) throw err;
                                            seriesID = result.insertId;
                                            addSeries(user, seriesID);
                                        });
                                    } else if (genres.length === 4) {
                                        sql2 = "INSERT INTO all_series (series_name, genre1, genre2, genre3, genre4) VALUES (?,?,?,?,?)";
                                        con.query(sql2, [name, genres[0], genres[1], genres[2], genres[3]], function(err, result) {
                                            if (err) throw err;
                                            seriesID = result.insertId;
                                            addSeries(user, seriesID);
                                        });
                                    } else if (genres.length === 5) {
                                        sql2 = "INSERT INTO all_series (series_name, genre1, genre2, genre3, genre4, genre5) VALUES (?,?,?,?,?,?)";
                                        con.query(sql2, [name, genres[0], genres[1], genres[2], genres[3], genres[4]], function(err, result) {
                                            if (err) throw err;
                                            seriesID = result.insertId;
                                            addSeries(user, seriesID);
                                        });
                                    }
                                }
                            }, function showError() {
                                res.end("series not found");
                            });
                        }
                    } else {
                        throw err;
                    }
                });
            }
        } else {
            throw err;
        }
    });
    //add series into the user's table after the series exits in the database
    function addSeries(user, seriesID) {
        var sql3 = "INSERT INTO ?? (series_id) VALUES (?)";
        con.query(sql3, [user, seriesID], function (err) {
            if (err) throw err;
            res.end("series added");
        });
    }
});

//get a list of all shows in user's table
router.get("/ownseries", function (req, res) {
    var q = url.parse(req.url, true).query;
    var user = q.username;
    var sql = "SELECT s.series_name, u.season, u.episode FROM ?? AS u LEFT JOIN all_series AS s ON u.series_id=s.series_id";
    con.query(sql, [user], function (err, result) {
        if (err) throw err;
        res.end(JSON.stringify(result));
    });
});

//change the data of a show (season, episode) and optionally give it a rating
router.get("/editseries", function (req, res) {
    var q = url.parse(req.url, true).query;
    var name = q.showname;
    var user = q.username;
    var episode = q.episode;
    var season = q.season;
    var score = q.score;
    var sql="UPDATE ?? SET season=?, episode=? WHERE series_id=(SELECT series_id FROM all_series WHERE series_name=?)";
    con.query(sql, [user, season, episode, name], function (err) {
        if (err) throw err;
        //if the series has been given a rating
        if (!isNaN(score)) {
            score = parseFloat(score);
            var sql2 = "UPDATE all_series SET score=score+?, votes=votes+1 WHERE series_name=?";
            con.query(sql2, [score, name], function (err) {
                if (err) throw err;
                res.end("series and rating updated");
            });
        } else {
            score = 0;
            res.end("series updated");
        }
    });
});

//get a list of all genres
router.get("/genres", function (req, res){
    var sql = "SELECT * from genre;";
    con.query(sql, function(err, result){
        if(err)
            throw (err);
        else {
            res.send(JSON.stringify(result));
        }
    })
});

//delete a show from user's table
router.get("/deleteseries", function (req, res) {
    var q = url.parse(req.url, true).query;
    var name = q.showname;
    var user = q.username;
    var sql="DELETE FROM ?? WHERE series_id=(SELECT series_id FROM all_series WHERE series_name=?)";
    con.query(sql, [user, name], function (err) {
        if (err) throw err;
        res.end("series deleted");
    });
});

//delete a comment, user's can delete only own comments
router.get("/deletecomment", function (req, res) {
    var q = url.parse(req.url, true).query;
    var commentID = q.commentid;
    var sql = "DELETE FROM comments WHERE comment_id=?";
    con.query(sql, [commentID], function (err){
        if(err) throw err;
        res.end("comment deleted");
    })
});

//register a new user
router.post('/register', function(req, res) {
    var username = req.body.name;
    var useremail = req.body.email;
    var userpassword = bcrypt.hashSync(req.body.password, 8);
    var sql ="SELECT user_id FROM users WHERE username=?";
    //check if user name is alreaady taken
    con.query(sql, [username], function (err, result) {
        if (err) throw err;
        if(result) {
            if (result.length > 0) {
                res.send("This username is already in use");
            }
            //user doesn't exist yet, can be regisered with this name
            else {
                sql = "INSERT INTO USERS (username, email, password) VALUES ((?), (?), (?));";
                con.query(sql, [username, useremail, userpassword], function (err) {
                    if (err) throw err;
                    sql = "CREATE TABLE ?? (series_id INT NOT NULL, season INT NOT NULL DEFAULT '1', episode INT NOT NULL DEFAULT '1',FOREIGN KEY (series_id) REFERENCES all_series(series_id));";
                    //create a table for the new user's shows
                    con.query(sql, [username], function (err) {
                        if (err) throw(err);
                        sql = "SELECT * FROM users WHERE username = ?";
                        con.query(sql, [username], function (err, result) {
                            if (err) return res.status(500).send("There was a problem getting user");
                            var user = JSON.stringify((result));
                            let token = jwt.sign({id: user.user_id}, configUser.secret, {
                                expiresIn: 86400 // expires in 24 hours
                            });
                            res.status(200).send({auth: true, token: token, user: user});
                        });
                    })
                });
            }
        }
    })
});

//log in an existing user
router.post("/login", function(req, res) {
    var username = req.body.username;
    var password = req.body.password;
    var sql = "SELECT * FROM users WHERE username=?";
    //check if the user exists
    con.query(sql, [username], function(err, result) {
        if (err) throw err;
        if (result.length > 0) {
            var user = JSON.stringify((result));
            var valid = bcrypt.compareSync(password, result[0].password);
            if (!valid) {
                return res.status(401).send({ auth: false, token: null });
            } else {
                let token = jwt.sign({ id: user.user_id }, configUser.secret, { expiresIn: 86400 }); // expires in 24 hours
                res.status(200).send({ auth: true, token: token, user: user });
            }
        } else {
            return res.status(404).send("user not found");
        }
    })
});

module.exports = router;
