var path = require('path');
var fs = require('fs');
var readline = require('readline');
var google = require('googleapis');
var googleAuth = require('google-auth-library');
var cookieSession = require('cookie-session');
var clone = require('clone');
// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/calendar-nodejs-quickstart.json
var DOMAIN_NAME = 'mabler.ru';
var SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
  process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'calendar-nodejs-quickstart.json';
var credentials = {};
var Qiwi = require('node-qiwi-api').Qiwi;
var express = require('express');
var app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
// app.use(express.static('public'));
app.use(cookieSession({
  name: 'session',
  keys: ['key1', 'key2']
}))
app.use(function(req, res, next) {
  req.session.nowInMinutes = Math.floor(Date.now() / 60e3);
  next();
});
app.use('/', express.static('./public'));
(function init() {
  fs.readFile('client_secret.json', function processClientSecrets(err, content) {
    if (err) {
      console.log('Error loading client secret file: ' + err);
      return;
    }
    credentials = JSON.parse(content);
  });
})();
app.get('/', function(req, res) {
  var wallet = req.session.qiwiWallet || {};
  console.log("wallet.token=" + wallet.token);
  console.log("googleCode=" + req.session.googleCode);
  console.log("googleToken=" + req.session.googleToken);
  var googleToken = req.session.googleToken || false;
  if (googleToken) {
    listEvents(getGoogleAuth(req.session.googleToken));
    // watchCalendar(req.query.code);
  }
  var qiwiToken = req.session.qiwiToken || false;
  if (qiwiToken) {
    console.log("qiwiToken=" + qiwiToken);
  }
  res.render('pages/index', {
    'google': googleToken != false,
    'qiwi': qiwiToken != false,
    'qiwi_balance': 1
  });
});
app.get('/logout', function(req, res) {
  req.session = null;
  res.redirect('/');
});
app.get('/googleAuth', function(req, res) {
  if (req.session.googleToken) {
    getOAuth2Client().credentials = JSON.parse(req.session.googleToken);
    res.redirect('/');
  } else {
    var authUrl = getOAuth2Client().generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES
    });
    res.redirect(authUrl);
  }
});
app.get('/qiwiAuth', function(req, res) {
  //res.redirect("https://qiwi.com/api");
  if (req.query.token) {
    req.session.qiwiWallet = new Qiwi(req.query.token);
    req.session.qiwiToken = req.query.token;
  }
  res.redirect("/");
});
app.get('/createEvent', function(req, res) {
  res.redirect('/?done=1');
});
// http://127.0.0.1:3000/oauth2callback?code=4/tbRgf5SBRGKzuhZE7AP-6KNAU0d2xaPNUiixRaxwXyg#
app.get('/oauth2callback', function(req, res) {
  console.log(req.query.code);
  req.session.googleCode = req.query.code;
  // res.redirect('/?google=true&code=' + req.query.code);
  getOAuth2Client().getToken(req.session.googleCode, function(err, token) {
    if (err) {
      console.log('Error while trying to retrieve access token', err);
      res.redirect('/?error=' + err);
      return;
    }
    getOAuth2Client().credentials = token;
    req.session.googleToken = token;
    req.session.googleWatchCalendar = {};
    //todo fix: replace req.session.googleCode with user uuid
    watchCalendar(getGoogleAuth(req.session.googleToken), req.session.googleCode,function(response) {
      req.session.googleWatchCalendar = response;
      console.log('watchCalendar response=', response);
    });
    res.redirect('/');
  });
});
app.post('/googlecalendarpushcallback', function(req, res) {
  // console.log(req);
});
app.listen(3000, function() {
  console.log('QiwiCalendar app listening on port 3000!')
})

var oauth2Client = null;

function getOAuth2Client() {
  if (!oauth2Client) {
    var clientSecret = credentials.web.client_secret;
    var clientId = credentials.web.client_id;
    var redirectUrl = credentials.web.redirect_uris[0];
    var auth = new googleAuth();
    oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);
  }
  return oauth2Client;
}

function getGoogleAuth(token) {
  var _oauth2Client = clone(getOAuth2Client());
  _oauth2Client.credentials = token;
  return _oauth2Client;
}

function listEvents(auth) {
  var calendar = google.calendar('v3');
  calendar.events.list({
    auth: auth,
    calendarId: 'primary',
    timeMin: (new Date()).toISOString(),
    maxResults: 10,
    singleEvents: true,
    orderBy: 'startTime'
  }, function(err, response) {
    if (err) {
      console.log('The API returned an error: ' + err);
      return;
    }
    var events = response.items;
    if (events.length == 0) {
      console.log('No upcoming events found.');
    } else {
      console.log('Upcoming 10 events:');
      for (var i = 0; i < events.length; i++) {
        var event = events[i];
        var start = event.start.dateTime || event.start.date;
        console.log('%s - %s', start, event.summary);
      }
    }
  });
}

function stopWatch(auth, id, resourceId) {
  var calendar = google.calendar('v3');
  calendar.channels.stop({
    auth: auth,
    id: id,
    resourceId: resourceId
  }, function(err, response) {
    if (err) {
      console.log('The API returned an error: ' + err);
      return;
    }
    console.log(response);
  });
}

function watchCalendar(auth, channelId, callback) {
  /*
  https://developers.google.com/google-apps/calendar/v3/reference/events/watch
  POST https://www.googleapis.com/calendar/v3/channels/stop
Authorization: Bearer {auth_token_for_current_user}
Content-Type: application/json
{
  "id": "4ba78bf0-6a47-11e2-bcfd-0800200c9a66",
  "resourceId": "ret08u3rv24htgh289g"
}
  */

  var calendar = google.calendar('v3');
  // calendar.channels.events.watch({
  calendar.events.watch({
    auth: auth,
    calendarId: 'primary',
    singleEvents: true,
    orderBy: 'startTime',
    resource: {
      id: channelId,
      // token: 'email=' + '* placed my email*',
      type: 'web_hook',
      address: 'https://' + DOMAIN_NAME + '/googlecalendarpushcallback',
      params: {
        ttl: '36000'
      }
    }
  }, function(err, response) {
    if (err) {
      console.log('The API returned an error: ' + err);
      // return;
    }
    // var events = response.items;
    console.log(response);
    callback(err, response);
  });
}
