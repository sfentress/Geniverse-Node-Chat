var CONFIG = { debug: false
             , nick: "#"   // set in onConnect
             , id: null    // set in onConnect
             , last_message_time: 1
             };

var nicks = [];

var lastOrg;

function updateUsersLink ( ) {
  var t = nicks.length.toString() + " user";
  if (nicks.length != 1) t += "s";
  $("#usersLink").text(t);
}

function userJoin(nick, timestamp) {
  addMessage(nick, "joined", timestamp, "join");
  for (var i = 0; i < nicks.length; i++)
    if (nicks[i] == nick) return;
  nicks.push(nick);
  updateUsersLink();
}

function userPart(nick, timestamp) {
  addMessage(nick, "left", timestamp, "part");
  for (var i = 0; i < nicks.length; i++) {
    if (nicks[i] == nick) {
      nicks.splice(i,1)
      break;
    }
  }
  updateUsersLink();
}

// utility functions

util = {
  urlRE: /https?:\/\/([-\w\.]+)+(:\d+)?(\/([^\s]*(\?\S+)?)?)?/g, 

  //  html sanitizer 
  toStaticHTML: function(inputHtml) {
    inputHtml = inputHtml.toString();
    return inputHtml.replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");
  }, 

  zeroPad: function (digits, n) {
    n = n.toString();
    while (n.length < digits) 
      n = '0' + n;
    return n;
  },

  timeString: function (date) {
    var minutes = date.getMinutes().toString();
    var hours = date.getHours().toString();
    return this.zeroPad(2, hours) + ":" + this.zeroPad(2, minutes);
  },

  isBlank: function(text) {
    var blank = /^\s*$/;
    return (text.match(blank) !== null);
  }
};

function scrollDown () {
  window.scrollBy(0, 100000000000000000);
  $("#entry").focus();
}

function addMessage (from, text, time, _class) {
  if (text === null)
    return;

  if (time == null) {
    // if the time is null or undefined, use the current time.
    time = new Date();
  } else if ((time instanceof Date) === false) {
    // if it's a timestamp, interpret it
    time = new Date(time);
  }

  var messageElement = $(document.createElement("table"));

  messageElement.addClass("message");
  if (_class)
    messageElement.addClass(_class);

  // sanitize
  text = util.toStaticHTML(text);

  // See if it matches our nick?
  var nick_re = new RegExp(CONFIG.nick);
  if (nick_re.exec(text))
    messageElement.addClass("personal");

  // replace URLs with links
  text = text.replace(util.urlRE, '<a target="_blank" href="$&">$&</a>');

  var content = '<tr>'
              + '  <td class="date">' + util.timeString(time) + '</td>'
              + '  <td class="nick">' + util.toStaticHTML(from) + '</td>'
              + '  <td class="msg-text">' + text  + '</td>'
              + '</tr>'
              ;
  messageElement.html(content);

  $("#log").append(messageElement);
  scrollDown();
}

var transmission_errors = 0;
var first_poll = true;

function longPoll (data) {
  if (transmission_errors > 2) {
    showConnect();
    return;
  }

  if (data && data.messages) {
    for (var i = 0; i < data.messages.length; i++) {
      var message = data.messages[i];

      if (message.timestamp > CONFIG.last_message_time)
        CONFIG.last_message_time = message.timestamp;

      switch (message.type) {
        case "msg":
          addMessage(message.nick, message.text, message.timestamp);
          break;

        case "join":
          userJoin(message.nick, message.timestamp);
          break;

        case "part":
          userPart(message.nick, message.timestamp);
          break;

		case "org":
          receiveOrganism(message.nick, message.text, message.timestamp);
          break;
      }
    }
    if (first_poll) {
      first_poll = false;
      who();
    }
  }

  $.ajax({ cache: false
         , type: "GET"
         , url: "/recv"
         , dataType: "json"
         , data: { since: CONFIG.last_message_time, id: CONFIG.id }
         , error: function () {
             addMessage("", "long poll error. trying again...", new Date(), "error");
             transmission_errors += 1;
             setTimeout(longPoll, 10*1000);
           }
         , success: function (data) {
             transmission_errors = 0;
             longPoll(data);
           }
         });
}

function send(msg) {
  if (CONFIG.debug === false) {
    // XXX should be POST
    jQuery.get("/send", {id: CONFIG.id, text: msg}, function (data) { }, "json");
  }
}

function showConnect () {
  $("#connect").show();
  $("#loading").hide();
  $("#toolbar").hide();
  $("#nickInput").focus();
}

function showLoad () {
  $("#connect").hide();
  $("#loading").show();
  $("#toolbar").hide();
}

function showChat (nick) {
  $("#toolbar").show();
  $("#entry").focus();

  $("#connect").hide();
  $("#loading").hide();

  scrollDown();
}

function onConnect (session) {
  if (session.error) {
    alert("error connecting: " + session.error);
    showConnect();
    return;
  }

  CONFIG.nick = session.nick;
  CONFIG.id   = session.id;

  showChat(CONFIG.nick);
}

function outputUsers () {
  var nick_string = nicks.length > 0 ? nicks.join(", ") : "(none)";
  addMessage("users:", nick_string, new Date(), "notice");
  return false;
}

function who () {
  jQuery.get("/who", {}, function (data, status) {
    if (status != "success") return;
    nicks = data.nicks;
    outputUsers();
  }, "json");
}

$(document).ready(function() {

  $("#entry").keypress(function (e) {
    if (e.keyCode != 13 /* Return */) return;
    var msg = $("#entry").attr("value").replace("\n", "");
    if (!util.isBlank(msg)) send(msg);
    $("#entry").attr("value", ""); // clear the entry field.
  });

  $("#usersLink").click(outputUsers);

	$("#sendbutton").click(function () {
		sendCurrentOrganism()
	  });
	
	$("#loadbutton").click(function () {
		loadLastOrganism()
	  });
	
	$("#randombutton").click(function () {
		addRandomOrganism()
	  });

  $("#connectButton").click(function () {
    showLoad();
    var nick = $("#nickInput").attr("value");

    if (nick.length > 50) {
      alert("Nick too long. 50 character max.");
      showConnect();
      return false;
    }

    if (/[^\w_\-^!]/.exec(nick)) {
      alert("Bad character in nick. Can only have letters, numbers, and '_', '-', '^', '!'");
      showConnect();
      return false;
    }

    $.ajax({ cache: false
           , type: "GET" // XXX should be POST
           , dataType: "json"
           , url: "/join"
           , data: { nick: nick }
           , error: function () {
               alert("error connecting to server");
               showConnect();
             }
           , success: onConnect
           });
    return false;
  });

  // update the clock every second
  setInterval(function () {
    var now = new Date();
    $("#currentTime").text(util.timeString(now));
  }, 1000);

  if (CONFIG.debug) {
    $("#loading").hide();
    $("#connect").hide();
    scrollDown();
    return;
  }

  // remove fixtures
  $("#log table").remove();

  longPoll();

  showConnect();
});

$(window).unload(function () {
  jQuery.get("/part", {id: CONFIG.id}, function (data) { }, "json");
});

// *** Biologica Chat functions

function sendOrg(org) {
  if (CONFIG.debug === false) {
    // XXX should be POST

	var jsonOrg = JSON.stringify(new organism(org));
    jQuery.get("/sendorg", {id: CONFIG.id, organism: jsonOrg}, function (data) { }, "json");
  }
}

function receiveOrganism(from, org, time) {
	lastOrg = org;
	addMessage(from, "Sent a dragon", time, "org");
}

// *** Biologica Applet interaction functions

function sendCurrentOrganism(){
	var org = document.getElementById("static-org-applet").getOrganisms()[0];
	if (org != null)
	  	sendOrg(org);
	else
		send("could not load org");
}

function loadLastOrganism() {
	addMessage("System", "Loading dragon", new Date(), "org");
	var applet = document.getElementById("static-org-applet");
	var jsonOrg = JSON.parse(lastOrg);
	var alleleString = jsonOrg.alleleString;
	var org = applet.createOrganismWithAlleleString(alleleString)
	applet.addOrganisms([org]);
}

function addRandomOrganism(){
	var applet = document.getElementById("static-org-applet");
	var org = applet.createOrganismWithAlleleString("");
	applet.addOrganisms([org]);
}

// *** Biologica Organism functions, needed for JSON, copied from gvdemo5

function organism(org) {
  chromosomes = [];
  this.name = org.getName();
  this.sex = org.getSexAsString();
  this.alleleString = org.getAlleleString();
  chromosomes = getChromosomeArray(org);
  
  //Still hard-wiring for standard dragon world order, and doing it all the hard way...
  this.chromosomeA = {"Horns" : chromosomes[0].charAt(0), "Scales" : chromosomes[0].charAt(1), "Wings" : chromosomes[0].charAt(2), "Legs" : chromosomes[0].charAt(3), "Tails" : chromosomes[0].charAt(4)};
  this.chromosomeB = {"Horns" : chromosomes[1].charAt(0), "Scales" : chromosomes[1].charAt(1), "Wings" : chromosomes[1].charAt(2), "Legs" : chromosomes[1].charAt(3), "Tails" : chromosomes[1].charAt(4)};
  this.chromosomeSexA = {"Plates" : chromosomes[2].charAt(0), "Fire" : chromosomes[2].charAt(1), "Color1" : chromosomes[2].charAt(2), "Color2" : chromosomes[2].charAt(3)};
  this.chromosomeSexB = {"Plates" : chromosomes[3].charAt(0), "Fire" : chromosomes[3].charAt(1), "Color1" : chromosomes[3].charAt(2), "Color2" : chromosomes[3].charAt(3)};
}
function getChromosomeArray(org) {
  alleleString = org.getAlleleString();
  sex = org.getSexAsString();
  chromAString = "";
  chromBString = "";
  chromSexAString = "";
  chromSexBString = "";
  var chromosomeArray = [];
  
  //Split allele string into array elements
  var alleles = alleleString.split(",");
  
  //For now, hard coding into the loop the fact that sex chromosomes start at position 5...
  for(var i=0; i<10; i++) {
    //Parse array into separate chromosome allele strings the hard way:
    var string = alleles[i];
    posA = string.indexOf("a:")
    if(posA != -1) {
      chromAString += string.charAt(posA+2);
    }
    posB = string.indexOf("b:")
    if(posB != -1) {
      chromBString += string.charAt(posB+2);
    }
  }
  
  //Continuing crude hard-coding of allele numbers to extract sex chromosomes
  for(var i=10; i<alleles.length; i++) {
    var string = alleles[i];
    posA = string.indexOf("a:")
    if(posA != -1) {
      chromSexAString += string.charAt(posA+2);
    }
    posB = string.indexOf("b:")
    if(posB != -1) {
      chromSexBString += string.charAt(posB+2);
    }
  } 
  //alert("A str: " + chromAString + " B str: " + chromBString + " Sex Chrom A: " + chromSexAString + " Sex chrom B: " + chromSexBString);
  //Initialize chromosome array – still hard-wired for standard dragon chromosome.
  chromosomeArray[0] = chromAString;
  chromosomeArray[1] = chromBString;
  chromosomeArray[2] = chromSexAString;
  chromosomeArray[3] = chromSexBString;
  return chromosomeArray;
}