const express = require('express');
const router = express.Router();
const { ensureAuthenticated, forwardAuthenticated } = require('../config/auth');
const User = require('../models/User');

var path = require('path');

// Uploading image
const multer = require('multer');
const { nextTick } = require('process');
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './public/uploads');
  },
  filename: function (req, file, cb){
    cb(null, req.user.username + 'avatar.png');
  }
});
const upload = multer({
  storage: storage,
  limits:  { fileSize: 1000000 },
  fileFilter: (req, file, cb) => {
    // Allowed ext
    const filetypes = /jpeg|jpg|png/;
    // Check ext
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    // Check mime
    const mimetype = filetypes.test(file.mimetype);
    if(mimetype && extname){
    cb(null, true);
    } else {
      cb(null, false);
    }
  }
});

// Welcome Page
router.get('/', forwardAuthenticated, (req, res) => 
  res.render('welcome', {
    signedin: false
  })
);

// Dashboard
router.get('/dashboard', ensureAuthenticated, (req, res) =>
  res.render('dashboard', {
    user: req.user,
    signedin: true
  })
);

// Activity page
router.get('/activity', ensureAuthenticated, async (req, res, next) => {
  var signedin = req.isAuthenticated();
  const user = req.user;
  var recentreviews = [];

  //Get friends reviews within filtered date
  await Promise.all(user.friends.map(async friend => {
    var foundfriend = await User.findOne({username: friend});
    var currentDate = new Date();
    var temp = currentDate.setDate(currentDate.getDate()- 3);
    var filterDate = new Date(temp);
    var userphoto = foundfriend.customphoto ? foundfriend.username+'avatar.png' : 'default.png';

    var filteredReviews = []
    foundfriend.reviews.forEach(review => {
      if (review.date>filterDate){
        review.userphoto = userphoto;
        filteredReviews.push(review);
      }
    });
    recentreviews = recentreviews.concat(filteredReviews)
  }));
  recentreviews.sort((a,b) => (a.date > b.date) ? 1 : ((b.date > a.date) ? -1 : 0))
  console.log(recentreviews);

  res.render('activity', {
    user: req.user,
    recentreviews: recentreviews,
    signedin: signedin
  });
});

// User's Friends page
router.get('/:id/friends', (req, res, next) => {
  var signedin = req.isAuthenticated();
  const username = req.params.id;
  User.findOne({username: username}).then(async user => {
    if (user){
      var userfriends = [];
      // Grab friends info
      await Promise.all(user.friends.map(async friend => {
        var foundfriend = await User.findOne({username: friend});
        var userphoto = foundfriend.customphoto ? foundfriend.username+'avatar.png' : 'default.png';
        userfriends.push({username: foundfriend.username, userphoto: userphoto, numfriends: foundfriend.friends.length});
      }))
      res.render('userfriends', {
        user: req.user,
        viewuser: user,
        userfriends: userfriends,
        signedin: signedin
      });
    }
    else {
      next();
    }
  });
});

// User's Reviews page
router.get('/:id/reviews', (req, res, next) => {
  var signedin = req.isAuthenticated();
  const username = req.params.id;
  User.findOne({username: username}).then(user => {
    if (user){
      var userphoto = user.customphoto ? user.username+'avatar.png' : 'default.png';
      res.render('userreviews', {
        user: req.user,
        userphoto: userphoto,
        viewuser: user,
        signedin: signedin
      });
    }
    else {
      next();
    }
  });
});

// Add friend
router.post('/add/:id', ensureAuthenticated, (req, res, next) => {
  const user = req.user;
  const username = req.params.id;
  const type = 'friendrequest';
  const friendrequest = {from: user.username, type: type};

  if (username === user.username){
    req.flash('error_msg', "Can't add yourself!");
    res.redirect('/'+username);
    return;
  }

  if (user.friends.find(friend => friend === username)){
    req.flash('error_msg', "User is already your friend!");
    res.redirect('/'+username);
    return;
  }

  //Does user have pending request from reciever? If so add eachother
  var idx = user.inbox.findIndex(message => message.from === username && message.type === type);
  if (idx>-1){
    User.findOne({username: username})
    .then(founduser => {
      if (founduser){
        user.inbox.splice(idx, 1);
        user.friends.push(username);
        user.save();
        founduser.friends.push(user.username);
        founduser.save();
      }
    })
    .then(response => {
      req.flash('success_msg', 'Friend added!');
      res.redirect(req.get('referer'));
      return;
    })
    .catch(err => {
      console.log(err);
      req.flash('error_msg', 'something went wrong');
      res.redirect('/'+username);
    })
    return;
  }

  //Send request to recievers inbox
  User.findOne({username: username})
  .then(founduser => {
    if (founduser){
      if (founduser.inbox.find(message => message.from === user.username && message.type === type)){
        req.flash('error_msg', 'Friend request already sent!');
        res.redirect('/'+username);
      } else {
        founduser.inbox.push(friendrequest);
        founduser.save();
        req.flash('success_msg', 'Friend request sent!');
        res.redirect('/'+username);
      }
    } else {
      req.flash('error_msg', 'user not found!');
      res.redirect('/'+username);
    }
  }).catch(err => {
    console.log(err);
    req.flash('error_msg', 'something went wrong');
    res.redirect('/'+username);
  })
});

router.post('/denyrequest/:index', ensureAuthenticated, (req, res, next) => { 
  const user = req.user;
  const index = req.params.index;

  if (user.inbox[index]){
    user.inbox.splice(index, 1);
    user.save();
  }
  res.redirect(req.get('referer'));
});

// User avatar upload
router.post('/upload', ensureAuthenticated, upload.single('photo'), (req, res) => {
  if(req.file) {
    User.findOne({username: req.user.username }).then(user => {
      if (user){
        if (!user.customphoto){
          user.customphoto = true;
          user.save().then(user => {
            req.flash('success_msg', 'File uploaded!');
            res.redirect('/profile');
          });
        } else { 
          req.flash('success_msg', 'File uploaded!');
          res.redirect('/profile');
        }
      } else {
        req.flash('error_msg', 'Error uploading!');
        res.redirect('/profile');
      }
    });
  }
  else{
    req.flash('error_msg', 'Invalid file type!');
    res.redirect('/profile');
  }
});



module.exports = router;
