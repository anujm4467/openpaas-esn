'use strict';

var q = require('q');

var logger = require('../../core/logger');
var features = require('../../core/features');
var esnConfig = require('../../core/esn-config');
var followModule = require('../../core/user/follow');
var sanitizeUser = require('../controllers/utils').sanitizeUser;

function sanitize(user, options) {
  return q(sanitizeUser(user, options.doNotKeepPrivateData || false));
}

function follow(user) {
  return followModule.getUserStats(user).then(function(stats) {
    user.followers = stats.followers || 0;
    user.followings = stats.followings || 0;
    return user;
  }, function() {
    user.followers = 0;
    user.followings = 0;
    return user;
  });
}

function setIsFollowing(user, loggedUser) {
  if (!loggedUser) {
    return q(user);
  }

  if (loggedUser._id.equals(user._id)) {
    return q(user);
  }

  return followModule.isFollowedBy(user, loggedUser).then(function(result) {
    user.following = result;
    return user;
  }, function(err) {
    return user;
  });
}

function setState(user, sanitized) {
  sanitized.disabled = !!user.login.disabled;
  return q(sanitized);
}

function loadFeatures(user, sanitized) {
  var deferred = q.defer();

  features.findFeaturesForDomain(user.preferredDomainId, function(err, features) {
    if (err) {
      logger.warn('Failed to load user\'s features', err);

      return deferred.resolve(sanitized);
    }

    sanitized.features = features;

    deferred.resolve(sanitized);
  });

  return deferred.promise;
}

function loadHomePage(user, sanitized) {
  return esnConfig('homePage')
    .forUser(user)
    .get()
    .then(function(homePage) {
      sanitized.preferences.homePage = homePage;

      return sanitized;
    })
    .catch(function(err) {
      logger.warn('Failed to load user\'s homePage preference', err);

      return sanitized;
    });
}

function loadPreferences(user, sanitized) {
  sanitized.preferences = {};

  return q.allSettled([
      loadHomePage(user, sanitized)
    ])
    .then(function() {
      return sanitized;
    });
}

function denormalize(user, options) {
  options = options || {};

  return sanitize(user, options)
    .then(function(sanitized) {
      return setIsFollowing(sanitized, options.user);
    })
    .then(follow)
    .then(setState.bind(null, user))
    .then(loadFeatures.bind(null, user))
    .then(loadPreferences.bind(null, user));
}
module.exports.denormalize = denormalize;
