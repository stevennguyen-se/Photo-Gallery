var express = require("express");
var app = express();
var bodyParser = require("body-parser");
var mongoose = require("mongoose");
var passport = require("passport");
var LocalStrategy = require("passport-local");
var methodOverride = require("method-override");
var flash = require("connect-flash");

var Campground = require("./models/campground.js");
var Comment = require("./models/comment.js");
var User = require("./models/user.js");

var middleware = require("./middleware");


app.use(flash());

//Passport configuration
app.use(require("express-session")({
    secret: "Lap Nguyen",
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

//https://stackoverflow.com/questions/33451053/req-locals-vs-res-locals-vs-res-data-vs-req-data-vs-app-locals-in-express-mi
app.use(function(req, res, next) {
    res.locals.currentUser = req.user;
    app.locals.moment = require('moment');
    res.locals.error = req.flash("error");
    res.locals.success = req.flash("success");
    next();
})

//Connect to database
//db.dropDatabase() to drop a database
//db.collectionName.drop() to drop a collection in a database

mongoose.connect("mongodb+srv://photohub:lMdesZx0dl0Vo4P6@cluster0.ad6nuln.mongodb.net/?retryWrites=true&w=majority", {useNewUrlParser: true, useUnifiedTopology: true});



app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + "/public"));
app.use(methodOverride("_method"));

app.set("view engine", "ejs");

//Show the landing page
app.get("/", function(req, res) {
    res.redirect("/photos");
});

function escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};

//Show all campgrounds
app.get("/photos", function(req, res) {
    var perPage = 8;
    var pageQuery = parseInt(req.query.page);
    var page = pageQuery ? pageQuery : 1;
    Campground.find({}).skip((perPage * page) - perPage).limit(perPage).exec(function(err, allCampgrounds) {
        if (err) {
            console.log(err)
        }
        else {
            Campground.count().exec(function(err, count) {
                if (err) {
                    console.log(err);
                }
                else {
                    res.render("places", {
                        campgrounds: allCampgrounds,
                        current: page,
                        pages: Math.ceil(count / perPage)
                    });
                }
            });
        }
    });
});

//Create a new campground
app.post("/photos", middleware.isLoggedIn, function(req, res) {
    if (req.body.name.length < 1) {
        req.body.name = "N/A";
    }
    var name = req.body.name;
   
    if (req.body.imgURL.length < 4) {
        req.body.imgURL = "http://placehold.it/600x400";
    }
    var imageURL = req.body.imgURL;
    var description = req.body.description
    var author = { id: req.user._id, username: req.user.username };
    var newCamp = { name: name, imageURL: imageURL, description: description, author: author };
    Campground.create(newCamp, function(err, camp) {
        if (err) {
            console.log("Cannot insert data to database!");
        }
        else {
            console.log(camp);
            res.redirect("/photos");
        }
    });
});

//Show to form to create a new campground
//Thang route nay phai de tren /campground/:id vi neu ko thi :id=new
app.get("/photos/new", middleware.isLoggedIn, function(req, res) {
    res.render("newCamp");
});

//Show the place's details
app.get("/photos/:id", function(req, res) {
    Campground.findById(req.params.id).populate("comments").exec(function(err, foundCampground) {
        if (err || !foundCampground) {
            req.flash("error", "Campground not found");
            res.redirect("/photos");
        }
        else {
            res.render("details", { campground: foundCampground });
        }
    });
});

app.get("/photos/:id/comments/new", middleware.isLoggedIn, function(req, res) {
    Campground.findById(req.params.id, function(err, foundCampground) {
        if (err) {
            console.log(err);
        }
        else {
            res.render("newComment", { campground: foundCampground });
        }
    })
});

app.post("/photos/:id/comments", middleware.isLoggedIn, function(req, res) {
    Campground.findById(req.params.id, function(err, foundCampground) {
        if (err) {
            console.log(err);
            res.redirect("/photos");
        }
        else {
            Comment.create(req.body.comment, function(err, addedComment) {
                if (err) {
                    console.log(err);
                }
                else {
                    addedComment.author.id = req.user._id;
                    addedComment.author.username = req.user.username;
                    addedComment.save();

                    foundCampground.comments.push(addedComment);
                    foundCampground.save();


                    req.flash("success", "Successfuly added a new comment!");
                    res.redirect("/photos/" + foundCampground._id);
                }
            });
        }
    });
});

app.get("/photos/:campground_id/comments/:comment_id/edit", middleware.isCommentOwner, function(req, res) {
    Campground.findById(req.params.campground_id, function(err, foundCampground) {
        if (err || !foundCampground) {
            req.flash("error", "Campground not found");
            return res.redirect("back");
        }
        else {
            Comment.findById(req.params.comment_id, function(err, foundComment) {
                if (err) {
                    console.log(err);
                }
                else {
                    res.render("editComment", { comment: foundComment, campground_id: req.params.campground_id });
                }
            });
        }
    });

});

app.put("/photos/:campground_id/comments/:comment_id", middleware.isCommentOwner, function(req, res) {
    Comment.findByIdAndUpdate(req.params.comment_id, req.body.comment, function(err, updatedComment) {
        if (err) {
            res.redirect("back");
        }
        else {
            res.redirect("/photos/" + req.params.campground_id);
        }
    })
});

app.delete("/photos/:campground_id/comments/:comment_id", middleware.isCommentOwner, function(req, res) {
    Comment.findByIdAndRemove(req.params.comment_id, function(err, deletedComment) {
        if (err) {
            res.redirect("back");
        }
        else {
            req.flash("success", "Successfuly deleted a new comment!");
            res.redirect("/photos/" + req.params.campground_id);
        }
    });

});

app.get("/register", function(req, res) {
    res.render("register", { page: "register" });
});

app.post("/register", function(req, res) {
    var newUser = new User({ username: req.body.username });
    if (req.body.adminCode === "4444") {
        newUser.isAdmin = true;
    }

    User.register(newUser, req.body.password, function(err, addUser) {
        if (err) {
            req.flash("error", err.message);
            return res.redirect("/register");
        }
        passport.authenticate("local")(req, res, function() {
            req.flash("success", "Welcome! new user");
            res.redirect("/photos");
        });
    });
});

app.get("/login", function(req, res) {
    res.render("login", { page: "login" });
});

app.post("/login", passport.authenticate("local", { successRedirect: "/photos", failureRedirect: "/login" }), function(req, res) {});

app.get("/logout", function(req, res) {
    req.logout(function(err) {
        if (err) { 
            alert('Something wrong happened! Going to homepage')
            res.redirect("/photos");
        }
        
        req.flash("success", "Logged you out!");
        res.redirect("/photos");
      });
});

app.get("/photos/:id/edit", middleware.isCampgroundOwner, function(req, res) {
    Campground.findById(req.params.id, function(err, foundCampground) {
        if (err) {
            console.log(err);
        }
        else {
            res.render("editCampground", { campground: foundCampground });
        }
    });
});

app.put("/photos/:id", middleware.isCampgroundOwner, function(req, res) {
    var newData = { name: req.body.name, imageURL: req.body.imageURL, description: req.body.description };
    Campground.findByIdAndUpdate(req.params.id, { $set: newData }, function(err, campground) {
        if (err) {
            req.flash("error", err.message);
            res.redirect("back");
        }
        else {
            req.flash("success", "Successfully Updated!");
            res.redirect("/photos/" + campground._id);
        }
    });
});

app.delete("/photos/:id", middleware.isCampgroundOwner, function(req, res) {
    Campground.findByIdAndRemove(req.params.id, function(err, deletedCampground) {
        if (err) {
            console.log(err);
            res.redirect("/photos");
        }
        else {
            res.redirect("/photos");
        }
    });
});

app.listen(process.env.PORT || 3000, process.env.IP, function() {
    console.log("The server has started! " + process.env.PORT + " " + process.env.IP);
});
