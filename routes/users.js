const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const passport = require('passport');
// Load User model
const User = require('../models/User');
const { forwardAuthenticated } = require('../config/auth');
const signedin = false;

// Login Page
router.get('/login', forwardAuthenticated, (req, res) => 
  res.render('login', {
    signedin: signedin
  })
);

// Register Page
router.get('/register', forwardAuthenticated, (req, res) => 
  res.render('register', {
    signedin: signedin
  })
);

// Register
router.post('/register', (req, res) => {
  const { username, email, password } = req.body;
  let errors = [];

  if (!username || !email || !password ) {
    errors.push({ msg: 'Please enter all fields' });
    res.render('register', {
      errors,
      username,
      email,
      signedin,
      password
    });
    return;
  }

  if (!/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email)){
    errors.push({ msg: 'Please enter a valid email' });
    res.render('register', {
      errors,
      username,
      email,
      signedin,
      password
    });
    return;
  }

  if (username.length > 10) {
    errors.push({ msg: 'Username must be less then 10 characters' });
    res.render('register', {
      errors,
      username,
      email,
      signedin,
      password
    });
    return;
  }

  substrings = ['song','users', 'search', 'album', 'login', 'register'];
  if (substrings.some(v => username.includes(v))) {
    errors.push({ msg: 'Invalid username!' });
    res.render('register', {
      errors,
      username,
      email,
      signedin,
      password
    });
    return;
  }

  if (password.length < 6) {
    errors.push({ msg: 'Password must be at least 6 characters' });
    res.render('register', {
      errors,
      username,
      email,
      signedin,
      password
    });
    return;
  }

  if (errors.length > 0) {
    res.render('register', {
      errors,
      username,
      email,
      signedin,
      password
    });
  } else {
    User.findOne({ username: username }).then(user => {
      if (user) {
        errors.push({ msg: 'Username is taken!' });
        res.render('register', {
          errors,
          username,
          email,
          signedin,
          password
        });
      } else {
        User.findOne({ email : email }).then(user => {
          if (user) {
            errors.push({ msg: 'Email is already associated with an account!' });
            res.render('register', {
              errors,
              username,
              email,
              signedin,
              password
            });
          } else {
            const newUser = new User({
              username,
              email,
              password
            });
    
            bcrypt.genSalt(10, (err, salt) => {
              bcrypt.hash(newUser.password, salt, (err, hash) => {
                if (err) throw err;
                newUser.password = hash;
                newUser
                  .save()
                  .then(user => {
                    req.flash(
                      'success_msg',
                      'You are now registered and can log in'
                    );
                    res.redirect('/users/login');
                  })
                  .catch(err => console.log(err));
              });
            });
          }
        })
      }
    });
  }
});

// Login
router.post('/login', (req, res, next) => {
  passport.authenticate('local', {
    successRedirect: '/dashboard',
    failureRedirect: '/users/login',
    failureFlash: true
  })(req, res, next);
});

// Logout
router.get('/logout', (req, res) => {
  req.logout();
  req.flash('success_msg', 'You are logged out');
  res.redirect('/users/login');
});

module.exports = router;


