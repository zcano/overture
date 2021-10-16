const express = require('express');
const router = express.Router();
const { ensureAuthenticated, forwardAuthenticated } = require('../config/auth');
const User = require('../models/User');
const musicData = require('../models/musicData');
var SpotifyWebApi = require('spotify-web-api-node');

var spotifyApi = new SpotifyWebApi({
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET
});

spotifyApi.clientCredentialsGrant().then(
  function(data) {
    console.log('The access token expires in ' + data.body['expires_in']);
    console.log('The access token is ' + data.body['access_token']);

    // Save the access token so that it's used in future calls
    spotifyApi.setAccessToken(data.body['access_token']);
  },
  function(err) {
    console.log('Something went wrong when retrieving an access token', err);
  }
);

//update token if expired
async function getToken(){
  var api = await spotifyApi.clientCredentialsGrant();
  spotifyApi.setAccessToken(api.body['access_token']);
  console.log('The access token expires in ' + api.body['expires_in']);
  console.log('The access token is ' + api.body['access_token']);
}

async function getratingdata(id, type){
  var data = await musicData.findOne({ id: id, type: type });
  if (data){
    return data;
  } else {
    const newData = new musicData({id: id, type: type});
    var datacreated = await newData.save();
    return datacreated;
  }
}

// Search
router.get('/search', (req, res) => {
  var Search = 'search';
  var searchtype = 'songs';
  var signedin = req.isAuthenticated();

  if (req.query.Search){
    Search = req.query.Search;
  }
  if (req.query.type){
    searchtype = req.query.type;
  }

  if (searchtype=='users'){
    User.find({ username: { $regex: new RegExp(Search, 'i')} }).then(users => {
      res.render('search', {
        results: users,
        searchtype: searchtype,
        user: req.user,
        signedin: signedin,
        search: Search
      });
    });
  } 
  else if (searchtype=='songs') {
    spotifyApi.searchTracks(Search, { limit: 9 }).then(function(data) {
      var response = data.body.tracks.items;
      var songs = [];

      response.forEach(function(result) { 
        var id = result.id;
        var songname = result.name;
        var artists = [];
        var image = result.album.images[1].url;
        var popularity = result.popularity;
        result.artists.forEach(function(artist) {
          artists.push(artist.name);
        });
        songs.push({id: id, songname: songname, artists: artists, image: image, popularity: popularity});
      });

      res.render('search', {
        results: songs,
        searchtype: searchtype,
        user: req.user,
        signedin: signedin,
        search: Search
      });

    }, async function(err) {
      //renew token
      console.error(err);
      await getToken();
      return res.redirect('/search?Search='+Search+'&type='+searchtype+'');
    });
  } 
  else if (searchtype=='albums') {
    spotifyApi.searchAlbums(Search, { limit: 9 }).then(function(data) {
      var response = data.body.albums.items;
      var albums = [];

      response.forEach(function(result) {
        var count = result.total_tracks;
        var id = result.id;
        var albumname = result.name;
        var artists = [];
        var image = result.images[1].url;
        result.artists.forEach(function(artist) {
          artists.push(artist.name);
        });
        if (count>1){
          albums.push({id: id, albumname: albumname, artists: artists, image: image});
        }
      });

      res.render('search', {
        results: albums,
        searchtype: searchtype,
        user: req.user,
        signedin: signedin,
        search: Search
      });

    }, async function(err) {
      //renew token
      console.error(err);
      await getToken();
      return res.redirect('/search?Search='+Search+'&type='+searchtype+'');
    });
  } else {
    res.render('search', {
      searchtype: searchtype,
      user: req.user,
      signedin: signedin,
      search: Search
    });
  }
});

//Song page
router.get('/song/:id', (req, res, next) => {
  var signedin = req.isAuthenticated();
  const songid = req.params.id;
  spotifyApi.getTrack(songid).then(async function(data) {
    var response = data.body;
    var song;
    var type = response.type;
    var songname = response.name;
    var artists = [];
    response.artists.forEach(function(artist) {
      artists.push(artist.name);
    });
    var image = response.album.images[1].url;
    var album = response.album.name;

    song = {id: songid, songname: songname, album: album, artists: artists, image: image, type: type}
    var songdata = await getratingdata(songid, type);
    
    //get users photo and attach to review for frontend
    for (let index = 0; index < songdata.reviews.length; index++) {
      var user = await User.findOne({ username: songdata.reviews[index].username }).catch(err => console.log(err));
      songdata.reviews[index].userphoto = user.customphoto ? user.username+'avatar.png' : 'default.png';
    }
    
    //does user already have a review?
    var reviewexists = false;
    if (req.user){
      reviewexists = songdata.reviews.some(review => review.username == req.user.username);
    }

    res.render('song', {
      songdata: songdata,
      song: song,
      reviewexists: reviewexists,
      user: req.user,
      signedin: signedin
    });

  }, async function(err) {
    //renew token
    console.error(err);
    await getToken();
    return res.redirect('/song/'+songid);
  });
});

//Review song
router.post('/song/:id', ensureAuthenticated, (req, res) => {
  const { rating, review } = req.body;
  const user = req.user;
  const songid = req.params.id;

  if (review.length > 300){
    res.redirect('/song/'+songid);
    return;
  }

  //find song data, then push new review to array OR update user review
  musicData.findOne({id: songid}).then(async song => {
    if (song){
      const curuser = await User.findOne({username: user.username});
      var userreview = { id: songid, username: user.username, rating: rating, review: review, type: 'track', date: new Date() }
      var newrating = 0;
      
      //Update songs review or push new review
      var i = song.reviews.findIndex(review => review.username == user.username);
      if (song.reviews[i]){
        song.reviews[i].review = review;
        song.reviews[i].rating = rating;
        song.markModified('reviews');
      } else {
        song.reviews.push(userreview);
      }
      //calculate average rating
      song.reviews.forEach(review => {
        newrating += parseFloat(review.rating);
      });
      newrating = Math.round((newrating/song.reviews.length) * 2)/2;
      song.rating = newrating;

      await song.save();

      //Update user review or push new review
      var x = curuser.reviews.findIndex(review => review.id == songid);
      if (curuser.reviews[x]){
        curuser.reviews[x].review = review;
        curuser.reviews[x].rating = rating;
        curuser.markModified('reviews');
      } else {
        //add songname and artist info to users review data
        var track = await spotifyApi.getTrack(songid);
        userreview.name = track.body.name;
        var artists = [];
        track.body.artists.forEach(function(artist) {
          artists.push(artist.name);
        });
        userreview.artists = artists;
        curuser.reviews.push(userreview);
      }
  
      await curuser.save();
    } else {
      throw "Song not found";
    }
  })
  .then(res.redirect('/song/'+songid))
  .catch(err => console.log(err));
});


//Album page
router.get('/album/:id', (req, res, next) => {
  var signedin = req.isAuthenticated();
  const albumid = req.params.id;
  spotifyApi.getAlbum(albumid).then(async function(data) {
    var response = data.body;
    var album;
    var type = response.type;
    var albumname = response.name;
    var artists = [];
    response.artists.forEach(function(artist) {
      artists.push(artist.name);
    });
    var image = response.images[1].url;

    album = {id: albumid, albumname: albumname, artists: artists, image: image, type: type}
    var albumdata = await getratingdata(albumid, type);
    
    //get users photo and attach to review for frontend
    for (let index = 0; index < albumdata.reviews.length; index++) {
      var user = await User.findOne({ username: albumdata.reviews[index].username }).catch(err => console.log(err));
      albumdata.reviews[index].userphoto = user.customphoto ? user.username+'avatar.png' : 'default.png';
    }

    //does user already have a review?
    var reviewexists = false;
    if (req.user){
      reviewexists = albumdata.reviews.some(review => review.username == req.user.username);
    }

    res.render('album', {
      albumdata: albumdata,
      album: album,
      reviewexists: reviewexists,
      user: req.user,
      signedin: signedin
    });

  }, async function(err) {
    //renew token
    console.error(err);
    await getToken();
    return res.redirect('/album/'+albumid);
  });
});

//Review Album
router.post('/album/:id', ensureAuthenticated, (req, res) => {
  const { rating, review } = req.body;
  const user = req.user;
  const albumid = req.params.id;

  if (review.length > 300){
    res.redirect('/album/'+albumid);
    return;
  }

  //find song data, then push new review to array OR update user review
  musicData.findOne({id: albumid}).then(async album => {
    if (album){
      const curuser = await User.findOne({username: user.username});
      var userreview = { id: albumid, username: user.username, rating: rating, review: review, type: 'album', date: new Date() }
      var newrating = 0;

      //Update songs review or push new review
      var i = album.reviews.findIndex(review => review.username == user.username);
      if (album.reviews[i]){
        album.reviews[i].review = review;
        album.reviews[i].rating = rating;
        album.markModified('reviews');
      } else {
        album.reviews.push(userreview);
      }
      //calculate average rating
      album.reviews.forEach(review => {
        newrating += parseFloat(review.rating);
      });
      newrating = Math.round((newrating/album.reviews.length) * 2)/2;
      album.rating = newrating;

      await album.save();

      //Update user review or push new review
      var x = curuser.reviews.findIndex(review => review.id == albumid);
      if (curuser.reviews[x]){
        curuser.reviews[x].review = review;
        curuser.reviews[x].rating = rating;
        curuser.markModified('reviews');
      } else {
        //add songname and artist info to users review data
        var album = await spotifyApi.getAlbum(albumid);
        userreview.name = album.body.name;
        var artists = [];
        album.body.artists.forEach(function(artist) {
          artists.push(artist.name);
        });
        userreview.artists = artists;
        curuser.reviews.push(userreview);
      }
      await curuser.save();

    } else {
      throw "Song not found";
    }
  })
  .then(res.redirect('/album/'+albumid))
  .catch(err => console.log(err));
});

//Set favourite song
router.post('/favouritesong/:id', ensureAuthenticated, (req, res) => {
  const user = req.user;
  const songid = req.params.id;

  User.findOneAndUpdate({username: user.username}, {favouritesong: songid}).then(user => {
    res.redirect('/song/'+songid);
  }).catch(err => console.log(err));
});

//Set favourite Album
router.post('/favouritealbum/:id', ensureAuthenticated, (req, res) => {
  const user = req.user;
  const albumid = req.params.id;

  User.findOneAndUpdate({username: user.username}, {favouritealbum: albumid}).then(user => {
    res.redirect('/album/'+albumid);
  }).catch(err => console.log(err));
});

//Profile page
router.get('/profile', ensureAuthenticated, async (req, res) => {
  var user = req.user;
  var userphoto = user.customphoto ? user.username+'avatar.png' : 'default.png';
  if (user.favouritesong){
    var favsong = await getfavsong(user.favouritesong).catch(async err => {
      console.error(err);
      await getToken();
    });
  }
  if (user.favouritealbum){
    var favalbum = await getfavalbum(user.favouritealbum).catch(async err => {
      console.error(err);
      await getToken();
    });
  }
  res.render('profile', {
    isprofile: true,
    user: req.user,
    viewuser: user,
    signedin: true,
    favsong: favsong,
    favalbum: favalbum,
    userphoto: userphoto
  })
});

// User Page
router.get('/:id', (req, res, next) => {
  var signedin = req.isAuthenticated();
  const username = req.params.id;
  User.findOne({username: username}).then(async user => {
    if (user){
      if (signedin && req.user.username==user.username){
        res.redirect('/profile')
      }
      else {
        var userphoto = user.customphoto ? user.username+'avatar.png' : 'default.png';
        if (user.favouritesong){
          var favsong = await getfavsong(user.favouritesong).catch(async err => {
            console.error(err);
            await getToken();
          });
        }
        if (user.favouritealbum){
          var favalbum = await getfavalbum(user.favouritealbum).catch(async err => {
            console.error(err);
            await getToken();
          });
        }
        res.render('profile', {
          isprofile: false,
          user: req.user,
          viewuser: user,
          signedin: signedin,
          favsong: favsong,
          favalbum: favalbum,
          userphoto: userphoto
        })
      }
    }
    else {
      next();
    }
  });
});

async function getfavsong(songid){
  var track = await spotifyApi.getTrack(songid)
  .catch(error => {
    throw error;
  });
  var songname = track.body.name;
  var image = track.body.album.images[1].url;
  var artists = [];
  track.body.artists.forEach(function(artist) {
    artists.push(artist.name);
  });
  return {songname: songname, artists: artists, image: image}
}

async function getfavalbum(albumid){
  var album = await spotifyApi.getAlbum(albumid)
  .catch(error => {
    throw error;
  });
  var albumname = album.body.name;
  var image = album.body.images[1].url;
  var artists = [];
  album.body.artists.forEach(function(artist) {
    artists.push(artist.name);
  });
  return {albumname: albumname, artists: artists, image: image}
}

module.exports = router;