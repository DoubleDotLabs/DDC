//The Could Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');
const gcs = require('@google-cloud/storage')({
  keyFilename: 'serviceAccountKey.json'
});
const path = require('path');
const os = require('os');
const fs = require('fs');
const util = require('util');
const ApkReader = require('adbkit-apkreader');
const cors = require('cors');

//The Firebase Admin SDK to access the Firebase Realtime Database.
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

exports.createUser = functions.auth.user()
  .onCreate(event => {
    var path = "users/" + event.data.uid;

    var obj = {};
    obj[path + "/name"] = event.data.displayName;
    obj[path + "/image"] = event.data.photoURL;

    return admin.database().ref().update(obj).then(function() {
      //yay
    }, function(error) {
      console.log("Error adding user: ", error);
    });
  });

exports.writeApp = functions.database.ref("/apps/{appId}")
  .onWrite(event => {
    if (!event.data.exists() && !event.data.previous.exists()) {
      return null;
    }

    var data = (event.data.exists() ? event.data : event.data.previous);

    var userPath = "users/" + data.child("author").val() + "/apps/" + event.params
      .appId;

    if (event.data.previous.exists() && !event.data.exists()) {
      //remove app
      var obj = {};
      obj[userPath] = null;
      return admin.database().ref().update(obj).then(function() {
        //yay
      }, function(error) {
        console.log("Error removing app: ", error);
      });
    } else if (event.data.exists()) {
      //add app
      var obj = {};
      obj[userPath] = true;
      return admin.database().ref().update(obj).then(function() {
        //yay
      }, function(error) {
        console.log("Error adding app: ", error);
      });
    }
  });

exports.writeReview = functions.database.ref("/reviews/{reviewId}")
  .onWrite(event => {
    if (!event.data.exists() && !event.data.previous.exists()) {
      return null;
    }

    var data = (event.data.exists() ? event.data : event.data.previous);

    var appPath = "apps/" + data.child("app").val().split(".").join("_") +
      "/reviews/" + event.params.reviewId;
    var userPath = "users/" + data.child("author").val() + "/reviews/" +
      event.params.reviewId;

    if (event.data.previous.exists() && !event.data.exists()) {
      //remove review
      var obj = {};
      obj[appPath] = null;
      obj[userPath] = null;
      return admin.database().ref().update(obj).then(function() {
        //yay
      }, function(error) {
        console.log("Error removing reviews: ", error);
      });
    } else if (event.data.exists()) {
      //add review
      var obj = {};
      obj[appPath] = true;
      obj[userPath] = true;

      var dateObj = {};
      if (event.data.previous.exists() && event.data.previous.child("reply").val() !=
        event.data.child("reply").val()) {
        dateObj["replyDate"] = new Date().toDateString();
      } else {
        dateObj["date"] = new Date().toDateString();
      }

      return admin.database().ref().update(obj).then(function() {
        return event.data.ref.update(dateObj);
      }, function(error) {
        console.log("Error adding reviews: ", error);
      });
    }
  });

exports.writeCategory = functions.database.ref(
    "/categories/{categoryId}/apps/{appId}")
  .onWrite(event => {
    if (!event.data.exists() && !event.data.previous.exists()) {
      return null;
    }

    var data = (event.data.exists() ? event.data : event.data.previous);

    var appPath = "apps/" + event.params.appId + "/categories/" + event.params
      .categoryId;

    if (event.data.previous.exists() && !event.data.exists()) {
      //remove app
      var obj = {};
      obj[appPath] = null;
      return admin.database().ref().update(obj).then(function() {
        //yay
      }, function(error) {
        console.log("Error removing category from app: ", error);
      });
    } else if (event.data.exists()) {
      //add app
      var obj = {};
      obj[appPath] = true;
      return admin.database().ref().update(obj).then(function() {
        //yay
      }, function(error) {
        console.log("Error adding category to app: ", error);
      });
    }
  });

exports.writeAppCategory = functions.database.ref(
    "/apps/{appId}/categories/{categoryId}")
  .onWrite(event => {
    if (!event.data.exists() && !event.data.previous.exists()) {
      return null;
    }

    var data = (event.data.exists() ? event.data : event.data.previous);

    var categoryPath = "categories/" + event.params.categoryId + "/apps/" +
      event.params.appId;

    if (event.data.previous.exists() && !event.data.exists()) {
      //remove app
      var obj = {};
      obj[categoryPath] = null;
      return admin.database().ref().update(obj).then(function() {
        //yay
      }, function(error) {
        console.log("Error removing app from category: ", error);
      });
    } else if (event.data.exists()) {
      //add app
      var obj = {};
      obj[categoryPath] = true;
      return admin.database().ref().update(obj).then(function() {
        //yay
      }, function(error) {
        console.log("Error adding app to category: ", error);
      });
    }
  });

exports.notifyPublisherOfReview = functions.database.ref(
    "/apps/{appPackage}/reviews/{reviewId}")
  .onWrite(event => {
    if (!event.data.exists()) {
      return null;
    }

    const userId = event.params.reviewId.split("-")[1];
    return admin.database().ref("/users/" + userId + "/name").once("value").then(
      function(snapshot) {
        const userName = snapshot.val();
        return admin.database().ref("/apps/" + event.params.appPackage +
          "/name").once("value").then(function(snapshot) {
          const appName = snapshot.val();
          return admin.database().ref("/apps/" + event.params.appPackage +
            "/author").once("value").then(function(snapshot) {
            const authorId = snapshot.val();
            const notificationId = "review-" + event.params.appPackage +
              "-" + userId;
            const notification = {
              "notification": {
                "title": "New review for " + appName,
                "body": userName +
                  " has left a review for your app, " + appName +
                  "."
              },
              "data": {
                "date": new Date().toDateString(),
                "location-page": "reviews",
                "location-id": event.params.reviewId,
                "location-package": event.params.appPackage,
                "location-user": userId,
                "meta-id": notificationId,
                "type": "review"
              }
            };

            return admin.database().ref("/notifications/" +
              authorId + "/new/" + notificationId).set(
              notification).then(function() {
              return admin.database().ref("/users/" + authorId +
                "/notificationTokens").once("value").then(
                function(snapshot) {
                  var value = snapshot.val();
                  if (value) {
                    var tokens = [];
                    for (var key in value) {
                      tokens.push(key.indexOf(":") >= 0 ? key
                        .split(":").splice(1).join(":") :
                        key);
                    }

                    console.log("sending notifications: " +
                      tokens);
                    return admin.messaging().sendToDevice(
                      tokens, notification);
                  }
                });
            });
          });
        });
      });
  });

function getApkInfoPromise(bucket, name, fileName) {
  const tempFilePath = path.join(os.tmpdir(), fileName);

  return bucket.file(name).download({
    "destination": tempFilePath
  }).then(function() {
    return ApkReader.open(tempFilePath).then(function(reader) {
      return reader.readManifest();
    }).then(function(manifest) {
      return {
        "package": manifest.package,
        "min": manifest.usesSdk.minSdkVersion,
        "target": manifest.usesSdk.targetSdkVersion,
        "max": (manifest.usesSdk.maxSdkVersion ? manifest.usesSdk.maxSdkVersion :
          null),
        "permissions": manifest.usesPermissions,
        "features": manifest.usesFeatures,
        "screens": manifest.supportsScreens,
        "launcher": (manifest.application && manifest.application.launcherActivities[
            0] ? manifest.application.launcherActivities[0].name :
          null),
        "url": name
      };
    });
  });
}

exports.setStoragePath = functions.storage.object()
  .onChange(event => {
    const filePath = event.data.name.split("/");
    const fileName = path.basename(event.data.name);
    var obj = {};
    if (filePath[0] == "apps") {
      const appPackage = filePath[1];
      if (filePath[2] == "releases") {
        const releaseName = filePath[3];

        if (!releaseName && fileName.indexOf(".apk") < 0) {
          return null;
        }

        if (event.data.resourceState == "exists") {
          //file exists, download & get info
          return getApkInfoPromise(gcs.bucket(event.data.bucket), event.data.name,
            fileName).then(function(download) {
            var obj = {};
            obj["apps/" + appPackage + "/releases/" + releaseName +
              "/downloads/" + fileName.split(".")[0]] = download;

            return admin.database().ref().update(obj).then(function() {
              //yay
            }, function(error) {
              console.log("Error adding file info: ", error);
            });
          });
        } else {
          //delete info
          obj["apps/" + appPackage + "/releases/" + releaseName +
            "/downloads/" + fileName.split(".")[0]] = null;
        }
      } else if (filePath[2] == "images") {
        if (fileName.startsWith("header.")) {
          //set header image
          obj["apps/" + appPackage + "/header"] = event.data.name;
        } else if (fileName.startsWith("icon.")) {
          //set icon image
          obj["apps/" + appPackage + "/icon"] = event.data.name;
        } else if (fileName.startsWith("screenshot-")) {
          //set screenshot image
          obj["apps/" + appPackage + "/screenshots/" + fileName.split(".")[0]] =
            event.data.name;
        }
      }
    } else if (filePath[0] = "pending") {
      if (filePath.length < 4)
        return null;

      const author = filePath[1];

      return getApkInfoPromise(gcs.bucket(event.data.bucket), event.data.name,
        fileName).then(function(download) {
        var obj = {};

      });
    }

    return admin.database().ref().update(obj).then(function() {
      //yay
    }, function(error) {
      console.log("Error adding file info: ", error);
    });
  });

function getSignedFileUrlPromise(path) {
  if (!path)
    return Promise.resolve(null);

  if (path.startsWith("http"))
    return Promise.resolve(path);

  return gcs.bucket("ddstore-87442.appspot.com").file(path).getSignedUrl({
    "action": 'read',
    "expires": Date.now() + 600000
  });
}

function getAppsPromise(apps) {
  var promises = [];
  for (var appId in apps) {
    const appPackage = appId;
    promises.push(admin.database().ref("apps/" + appPackage).once("value").then(
      function(snapshot) {
        const app = snapshot.val();

        var downloads = 0;
        for (var key in app.releases) {
        	for (var key2 in app.releases[key].downloads) {
        		if (app.releases[key].downloads[key2].downloads)
        			downloads += app.releases[key].downloads[key2].downloads;
        	}
        }

        return getRatingPromise(app).then(function(rating) {
          return admin.database().ref("users/" + app.author).once(
            "value").then(function(snapshot) {
            const author = snapshot.val();

            return getSignedFileUrlPromise(app.icon).then(function(
              signedUrl) {
              const appIconUrl = signedUrl;

              return getSignedFileUrlPromise(app.header).then(
                function(signedUrl) {
                  const appHeaderUrl = signedUrl;

                  return {
                    "package": appPackage.split("_").join("."),
                    "name": app.name,
                    "icon": appIconUrl,
                    "header": appHeaderUrl,
                    "summary": app.summary,
                    "rating": rating,
                    "author": {
                      "id": app.author,
                      "name": author.name,
                      "image": author.image
                    },
					"downloads": downloads
                  };
                });
            });
          });
        });
      }));
  }

  return Promise.all(promises);
}

function getCategoryPromise(categoryId) {
  return admin.database().ref("categories/" + categoryId).once("value").then(
    function(snapshot) {
      const category = snapshot.val();

      return getAppsPromise(category.apps).then(function(apps) {
        return {
          "id": categoryId,
          "name": category.name,
          "description": category.description,
          "color": category.color,
          "background": category.background,
          "permission": category.permission,
          "apps": apps
        };
      });
    });
}

function getRatingPromise(app) {
  return getReviewsPromise(app.reviews, {
    "ratingsOnly": true
  }).then(function(ratings) {
    var rating = 0;
    for (var i = 0; i < ratings.length; i++) {
      rating += ratings[i];
    }

    return +((rating / ratings.length).toFixed(1));
  });
}

function getReviewPromise(reviewId) {
  return admin.database().ref("reviews/" + reviewId).once("value").then(
    function(snapshot) {
      const review = snapshot.val();

      return admin.database().ref("users/" + review.author).once("value").then(
        function(snapshot) {
          const author = snapshot.val();

          return admin.database().ref("apps/" + review.app.split(".").join(
            "_") + "/name").once("value").then(function(snapshot) {
            const appName = snapshot.val();

            return {
              "id": reviewId,
              "author": {
                "id": review.author,
                "name": author.name,
                "image": author.image
              },
              "app": {
                "package": review.app.split("_").join("."),
                "name": appName
              },
              "date": review.date,
              "rating": review.rating,
              "review": review.review,
              "reply": review.reply,
              "replyDate": review.replyDate
            };
          });
        });
    });
}

function getReviewsPromise(reviews, options) {
  var promises = [];
  for (var review in reviews) {
    const reviewId = review;
    promises.push(admin.database().ref("reviews/" + reviewId).once("value").then(
      function(snapshot) {
        const review = snapshot.val();

        if (options && options.ratingsOnly) {
          return review.rating;
        } else if (options && options.user) {
          return admin.database().ref("apps/" + review.app.split(".").join(
            "_") + "/name").once("value").then(function(snapshot) {
            const appName = snapshot.val();

            return {
              "id": reviewId,
              "author": {
                "id": review.author,
                "name": options.user.name,
                "image": options.user.image
              },
              "app": {
                "package": review.app.split("_").join("."),
                "name": appName
              },
              "date": review.date,
              "rating": review.rating,
              "summary": review.review.split(" ").slice(0, 30).join(" ") +
                "...",
              "reply": review.reply,
              "replyDate": review.replyDate
            };
          });
        } else {
          return admin.database().ref("users/" + review.author).once(
            "value").then(function(snapshot) {
            const author = snapshot.val();

            return {
              "id": reviewId,
              "author": {
                "id": review.author,
                "name": author.name,
                "image": author.image
              },
              "date": review.date,
              "rating": review.rating,
              "summary": review.review.split(" ").slice(0, 30).join(" ") +
                "...",
              "reply": review.reply != null,
              "replyDate": review.replyDate
            };
          });
        }
      }));
  }

  return Promise.all(promises);
}

exports.getCategories = functions.https.onRequest((req, res) => {
  cors()(req, res, () => {
    admin.database().ref("categories").once("value").then(function(
      snapshot) {
      const categories = snapshot.val();
      var promises = [];
      for (var categoryId in categories) {
        if (categoryId != "featured") {
          promises.push(getCategoryPromise(categoryId));
        }
      }

      Promise.all(promises).then(function(categories) {
        res.status(200).send(categories);
      });
    }, function(error) {
      res.status(404).send(error);
    });
  });
});

exports.getCategory = functions.https.onRequest((req, res) => {
  cors()(req, res, () => {
    if (req.query.categoryId) {
      getCategoryPromise(req.query.categoryId).then(function(category) {
        res.status(200).send(category);
      }, function(error) {
        res.status(404).send("Error 2: " + error);
      });
    } else res.status(404).send();
  });
});

exports.getApp = functions.https.onRequest((req, res) => {
  cors()(req, res, () => {
    if (req.query.appPackage) {
      admin.database().ref("apps/" + req.query.appPackage.split(".").join(
        "_")).once("value").then(function(snapshot) {
        const app = snapshot.val();

        var screenshots = [];
        for (var key in app.screenshots) {
          screenshots.push(app.screenshots[key]);
        }

		var totalDownloads = 0;
        var releases = [];
        for (var key in app.releases) {
          var release = app.releases[key];

          var downloads = [];
          for (var key2 in release.downloads) {
            downloads.push(release.downloads[key2]);
            if (release.downloads[key2].downloads)
            	totalDownloads += release.downloads[key2].downloads;
          }

          release.downloads = downloads;
          release.version = key.split("_").join(".");
          releases.push(release);
        }

        admin.database().ref("users/" + app.author).once("value").then(
          function(snapshot) {
            const author = snapshot.val();

            getSignedFileUrlPromise(app.header).then(function(
              signedUrl) {
              const headerUrl = signedUrl;

              getSignedFileUrlPromise(app.icon).then(function(
                signedUrl) {
                const iconUrl = signedUrl;

                getReviewsPromise(app.reviews).then(
                  function(reviews) {
                    var rating = 0;
                    for (var i = 0; i < reviews.length; i++) {
                      rating += reviews[i].rating;
                    }
                    rating = +((rating / reviews.length)
                      .toFixed(1));

                    res.status(200).send({
                      "name": app.name,
                      "author": {
                        "id": app.author,
                        "name": author.name,
                        "image": author.image
                      },
                      "header": headerUrl,
                      "icon": iconUrl,
                      "links": app.links,
                      "package": req.query.appPackage,
                      "summary": app.summary,
                      "description": app.description,
                      "screenshots": screenshots,
                      "rating": rating,
                      "ratings": reviews.length,
                      "reviews": reviews,
                      "releases": releases,
                      "downloads": totalDownloads
                    });
                  });
              });
            });
          });
      }, function(error) {
        res.status(404).send("Error 1: " + error);
      });
    } else res.status(404).send();
  });
});

exports.getReview = functions.https.onRequest((req, res) => {
  cors()(req, res, () => {
    if (req.query.reviewId) {
      getReviewPromise(req.query.reviewId).then(function(review) {
        res.status(200).send(review);
      }, function(error) {
        res.status(404).send("Error 1: " + error);
      });
    } else {
      res.status(404).send();
    }
  });
});

exports.getReviews = functions.https.onRequest((req, res) => {
  cors()(req, res, () => {
    if (req.query.appPackage) {
      admin.database().ref("apps/" + req.query.appPackage.split(".").join(
        "_") + "/reviews").once("value").then(function(snapshot) {
        getReviewsPromise(snapshot.val()).then(function(reviews) {
          res.status(200).send(reviews);
        }, function(error) {
          res.status(404).send("Error 2: " + error);
        });
      }, function(error) {
        res.status(404).send("Error 1: " + error);
      });
    } else if (req.query.userId) {
      admin.database().ref("users/" + req.query.userId + "/reviews").once(
        "value").then(function(snapshot) {
        getReviewsPromise(snapshot.val()).then(function(reviews) {
          res.status(200).send(reviews);
        }, function(error) {
          res.status(404).send("Error 2: " + error);
        });
      }, function(error) {
        res.status(404).send("Error 1: " + error);
      });
    } else {
      res.status(404).send();
    }
  });
});

exports.getUser = functions.https.onRequest((req, res) => {
  cors()(req, res, () => {
    if (req.query.userId) {
      admin.database().ref("users/" + req.query.userId).once("value").then(
        function(snapshot) {
          const user = snapshot.val();

          var links = [];
          for (var key in user.links) {
            links.push(user.links[key]);
          }

          getAppsPromise(user.apps).then(function(apps) {
            getReviewsPromise(user.reviews, {
              "user": user
            }).then(function(reviews) {
              res.status(200).send({
                "id": req.query.userId,
                "name": user.name,
                "image": user.image,
                "links": links,
                "apps": apps,
                "reviews": reviews
              });
            });
          });
        },
        function(error) {
          res.status(404).send("Error 1: " + error);
        });
    } else {
      res.status(404).send();
    }
  });
});


exports.searchApps = functions.https.onRequest((req, res) => {
  cors()(req, res, () => {
    if (req.query.queryText) {
      admin.database().ref("apps")
        .orderByChild("name")
        .startAt(req.query.queryText)
        .endAt(req.query.queryText + "\uf8ff")
        .once("value")
        .then(function(snapshot) {
          var result = snapshot.val();
          var promises = [];

          for (var key in result) {
            const app = result[key];
            const appPackage = key;

            promises.push(getRatingPromise(app).then(function(rating) {
              return admin.database().ref("users/" + app.author)
                .once("value").then(function(snapshot) {
                  const author = snapshot.val();

                  return getSignedFileUrlPromise(app.icon).then(
                    function(signedUrl) {
                      const appIconUrl = signedUrl;

                      return getSignedFileUrlPromise(app.header)
                        .then(function(signedUrl) {
                          const appHeaderUrl = signedUrl;

                          return {
                            "package": appPackage.split(
                              "_").join("."),
                            "name": app.name,
                            "icon": appIconUrl,
                            "header": appHeaderUrl,
                            "summary": app.summary,
                            "rating": rating,
                            "author": {
                              "id": app.author,
                              "name": author.name,
                              "image": author.image
                            }
                          };
                        });
                    });
                });
            }));
          }

          Promise.all(promises).then(function(apps) {
            res.status(200).send(apps);
          });
        }, function(error) {
          res.status(404).send(error);
        });
    } else {
      res.status(404).send();
    }
  });
});

exports.getDownloadURL = functions.https.onRequest((req, res) => {
  cors()(req, res, () => {
    if (req.query.path && req.query.path.startsWith("apps/")) {
      var pathArray = req.query.path.split("/");
      var packageName = pathArray[1];
      var releaseName = pathArray[3];
      var fileName = path.basename(req.query.path);

      admin.database().ref("apps/" + packageName + "/releases/" +
        releaseName + "/downloads/" + fileName.split(".")[0] +
        "/downloads").transaction((value) => {
        return ++value;
      }).then(function() {
        getSignedFileUrlPromise(req.query.path).then(function(url) {
          res.status(200).send(url);
        }, function(error) {
          res.status(404).send(error);
        });
      }, function(error) {
        res.status(404).send(error);
      });
    } else {
      res.status(404).send();
    }
  });
});

exports.getPending = functions.https.onRequest((req, res) => {
  cors()(req, res, () => {
  	admin.database().ref("pending")
  		.orderByChild("author")
  		.equalTo(req.query.authorId)
  		.once("value")
  		.then(function(snapshot) {
  			var pending = snapshot.val();
  			var apps = [];
  			for (var key in pending) {
  				pending[key]["package"] = key.split("_").join(".");
  				apps.push(pending[key]);
  			}

  			res.status(200).send(apps);	
  		}, function(error) {
  			res.status(404).send(error);
  		});
  });	
});
