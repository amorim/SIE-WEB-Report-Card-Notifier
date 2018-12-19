function doGet(e) {
    var fb = getFbInstance();
    var user = fb.getData('users/' + e.parameter.cpf);
    return ContentService.createTextOutput(JSON.stringify(user))
        .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
    var login = UrlFetchApp.fetch('https://sistemas.ufal.br/academico/login.seam');
    var cookie = login.getAllHeaders()['Set-Cookie'];
    var token = cookie.split('JSESSIONID=')[1].split(';')[0];
    var payload = {
        'loginForm': 'loginForm',
        'loginForm:username': e.parameter.cpf,
        'loginForm:password': e.parameter.password,
        'loginForm:entrar': 'Entrar',
        'javax.faces.ViewState': 'j_id1'
    };
    var header = {
        'Cookie': cookie
    };
    var opt = {
        'payload': payload,
        'headers': header,
        'method': 'post'
    }
    var home = UrlFetchApp.fetch('https://sistemas.ufal.br/academico/login.seam;jsessionid=' + token, opt);
    var boletim = UrlFetchApp.fetch('https://sistemas.ufal.br/academico/matricula/boletim.seam', {
        'headers': header,
        'method': 'get'
    });
    var html = boletim.getContentText('UTF-8');
    html = html.replace(/\t/g, "").replace(/\n/g, "");
    var tables = html.split("<br /><span style=\"font-weight: bold;\">");
    var periodos = [];
    for (var i = 1; i < tables.length; i++) {
        var periodo = {};
        periodo.year = parseInt(parseHTML(getBetweenStrings(tables[i], "Per&iacute;odo: ", " /")));
        if (isNaN(periodo.year))
            periodo.year = 0
        periodo.semester = parseHTML(getBetweenStrings(tables[i], "/ ", "</span>"));
        var body = tables[i].split("<tbody");
        var linhas = body[1].split("<tr");
        subjects = [];
        for (var j = 1; j < linhas.length; j++) {
            subject = {};
            aval = {};
            var cols = linhas[j].split("<td");
            cols.splice(0, 1);
            var codeandname = parseHTML(getBetweenStrings(cols[0], ">", "<"));
            var nameandcode = codeandname.split(" - ");
            subject.code = nameandcode[0];
            subject.name = normalizeString(nameandcode[1]);
            subject.workload = parseInt(parseHTML(getBetweenStrings(cols[1], ">", "<")));
            subject.absences = parseInt(getBetweenStrings(cols[8], ">", "<"));
            if (isNaN(subject.absences))
                subject.absences = 0
            subject.class = parseHTML(getBetweenStrings(cols[2], ">", "<"));
            cols[9] = cols[9].split('">')[2];
            subject.status = parseHTML(cols[9].split('<')[0]);
            var ab1 = getBetweenStrings(cols[3], ">", "<").replace(",", ".");
            aval.ab1 = parseFloat(ab1)
            if (isNaN(aval.ab1))
                aval.ab1 = -1
            var ab2 = getBetweenStrings(cols[4], ">", "<").replace(",", ".");
            aval.ab2 = parseFloat(ab2)
            if (isNaN(aval.ab2))
                aval.ab2 = -1
            var ra = getBetweenStrings(cols[5], ">", "<").replace(",", ".");
            aval.ra = parseFloat(ra)
            if (isNaN(aval.ra))
                aval.ra = -1
            var pf = getBetweenStrings(cols[6], ">", "<").replace(",", ".");
            aval.pf = parseFloat(pf)
            if (isNaN(aval.pf))
                aval.pf = -1
            var mf = getBetweenStrings(cols[7], ">", "<").replace(",", ".");
            aval.mf = parseFloat(mf)
            if (isNaN(aval.mf))
                aval.mf = -1
            subject.evaluations = aval;
            subjects.push(subject);
        }
        periodo.subjects = subjects;
        periodos.push(periodo);
    }
    var userinfo = {};
    userinfo.registration = html.split("Matr&iacute;cula:")[1].split("<td>")[1].split("</td>")[0];
    userinfo.name = normalizeString(html.split("Nome:")[1].split("<td>")[1].split("</td>")[0]);
    userinfo.reportcard = periodos;
    var goback = JSON.stringify(userinfo);
    userinfo.cpf = e.parameter.cpf;
    userinfo.password = e.parameter.password;
    saveToFirebase(userinfo);
    return ContentService.createTextOutput(goback)
        .setMimeType(ContentService.MimeType.JSON);
}

function verifyEachUser() {
    var fb = getFbInstance();
    var data = fb.getData('users/');
    for (reg in data) {
        var user = fb.getData('users/' + reg);
        var current = fetchFromSIEWEB(user.cpf, user.password);
        var boleto = user.reportcard;
        if (boleto) {
            if (boleto.length < current.length) {
                for (var i = 0; i < current.length; i++) {
                    var key = current[i].semester + current[i].year;
                    var found = findInArray(boleto, key);
                    if (found)
                        continue;
                    var message = "<p>Bem-vindo ao período " + current[i].semester + " de " + current[i].year + ". As matérias matriculadas são:</p><p><ul>";
                    for (var j = 0; j < current[i].subjects.length; j++)
                        message += "<li>" + current[i].subjects[j].name + "</li>";
                    message += "</ul></p>";
                    notifyUserHtml(message);
                }
            }
            for (var i = 0; i < boleto.length; i++) {
                if (!boleto[i])
                    continue;
                var key = boleto[i].semester + boleto[i].year;
                var cwanted = findInArray(current, key);
                if (!cwanted)
                    continue;
                if (boleto[i].subjects.length < cwanted.subjects.length) {
                    // nova disciplina matriculada no periodo 
                    // encontrar a nova disciplina e notificar
                } else if (boleto[i].subjects.length > cwanted.subjects.length) {
                    // disciplina excluida.
                    // encontrar e notificar
                }
                var fbsubjects = boleto[i].subjects;
                for (var j = 0; j < fbsubjects.length; j++) {
                    var swanted = findSubject(cwanted.subjects, fbsubjects[j].code);
                    if (!swanted)
                        continue;
                    var s1 = swanted;
                    var s2 = fbsubjects[j];

                    if (s1.absences != s2.absences)
                        notifyUser(s1.name, "Faltas atualizadas em " + s1.name + ". " + s1.absences + " faltas no total.");
                    if (s1.status != s2.status) {
                        if (s1.status == 'AP') {
                            notifyUser(s1.name, "Parabéns! Você foi aprovado em " + s1.name + " com média " + s1.evaluations.mf);
                        } else
                            notifyUser(s1.name, "Mudança de status na disciplina " + s1.name + ". O novo status é " + s1.status);
                    }
                    if (s1.evaluations.ab1 != s2.evaluations.ab1)
                        notifyUser(s1.name, "Nota da AB1 disponível para consulta em " + s1.name + ", " + s1.evaluations.ab1);
                    if (s1.evaluations.ab2 != s2.evaluations.ab2)
                        notifyUser(s1.name, "Nota da AB2 disponível para consulta em " + s1.name + ", " + s1.evaluations.ab2);
                    if (s1.evaluations.ra != s2.evaluations.ra)
                        notifyUser(s1.name, "Nota da reavaliação disponível para consulta em " + s1.name + ", " + s1.evaluations.ra);
                    if (s1.evaluations.pf != s2.evaluations.pf)
                        notifyUser(s1.name, "Nota da prova final disponível para consulta em " + s1.name + ", " + s1.evaluations.pf);
                }
            }
        }
        var userinfo = {};
        userinfo.registration = user.registration;
        userinfo.name = user.name;
        userinfo.reportcard = current;
        userinfo.cpf = user.cpf;
        userinfo.password = user.password;
        saveToFirebase(userinfo);
    }
}

function notifyUserHtml(html) {
    GmailApp.sendEmail("youremail", "Novo período matriculado", html, {
        htmlBody: html,
        name: "SIE WEB"
    });
}

function notifyUser(subjectname, message) {
    GmailApp.sendEmail("youremail", "Notas atualizadas em " + subjectname, message, {
        name: "SIE WEB"
    });
}

function findInArray(arr, value) {
    for (var i = 0; i < arr.length; i++) {
        if (arr[i].semester + arr[i].year == value)
            return arr[i];
    }
    return undefined;
}

function findSubject(arr, code) {
    for (var i = 0; i < arr.length; i++) {
        if (arr[i].code == code)
            return arr[i];
    }
    return undefined;
}

function fetchFromSIEWEB(cpf, password) {
    var login = UrlFetchApp.fetch('https://sistemas.ufal.br/academico/login.seam');
    var cookie = login.getAllHeaders()['Set-Cookie'];
    var token = cookie.split('JSESSIONID=')[1].split(';')[0];
    var payload = {
        'loginForm': 'loginForm',
        'loginForm:username': cpf,
        'loginForm:password': password,
        'loginForm:entrar': 'Entrar',
        'javax.faces.ViewState': 'j_id1'
    };
    var header = {
        'Cookie': cookie
    };
    var opt = {
        'payload': payload,
        'headers': header,
        'method': 'post'
    }
    var home = UrlFetchApp.fetch('https://sistemas.ufal.br/academico/login.seam;jsessionid=' + token, opt);
    var boletim = UrlFetchApp.fetch('https://sistemas.ufal.br/academico/matricula/boletim.seam', {
        'headers': header,
        'method': 'get'
    });
    var html = boletim.getContentText('UTF-8');
    html = html.replace(/\t/g, "").replace(/\n/g, "");
    var tables = html.split("<br /><span style=\"font-weight: bold;\">");
    var periodos = [];
    for (var i = 1; i < tables.length; i++) {
        var periodo = {};
        periodo.year = parseInt(parseHTML(getBetweenStrings(tables[i], "Per&iacute;odo: ", " /")));
        if (isNaN(periodo.year))
            periodo.year = 0
        periodo.semester = parseHTML(getBetweenStrings(tables[i], "/ ", "</span>"));
        var body = tables[i].split("<tbody");
        var linhas = body[1].split("<tr");
        subjects = [];
        for (var j = 1; j < linhas.length; j++) {
            subject = {};
            aval = {};
            var cols = linhas[j].split("<td");
            cols.splice(0, 1);
            var codeandname = parseHTML(getBetweenStrings(cols[0], ">", "<"));
            var nameandcode = codeandname.split(" - ");
            subject.code = nameandcode[0];
            subject.name = normalizeString(nameandcode[1]);
            subject.workload = parseInt(parseHTML(getBetweenStrings(cols[1], ">", "<")));
            subject.absences = parseInt(getBetweenStrings(cols[8], ">", "<"));
            if (isNaN(subject.absences))
                subject.absences = 0
            subject.class = parseHTML(getBetweenStrings(cols[2], ">", "<"));
            cols[9] = cols[9].split('">')[2];
            subject.status = parseHTML(cols[9].split('<')[0]);
            var ab1 = getBetweenStrings(cols[3], ">", "<").replace(",", ".");
            aval.ab1 = parseFloat(ab1)
            if (isNaN(aval.ab1))
                aval.ab1 = -1
            var ab2 = getBetweenStrings(cols[4], ">", "<").replace(",", ".");
            aval.ab2 = parseFloat(ab2)
            if (isNaN(aval.ab2))
                aval.ab2 = -1
            var ra = getBetweenStrings(cols[5], ">", "<").replace(",", ".");
            aval.ra = parseFloat(ra)
            if (isNaN(aval.ra))
                aval.ra = -1
            var pf = getBetweenStrings(cols[6], ">", "<").replace(",", ".");
            aval.pf = parseFloat(pf)
            if (isNaN(aval.pf))
                aval.pf = -1
            var mf = getBetweenStrings(cols[7], ">", "<").replace(",", ".");
            aval.mf = parseFloat(mf)
            if (isNaN(aval.mf))
                aval.mf = -1
            subject.evaluations = aval;

            subjects.push(subject);
        }
        periodo.subjects = subjects;
        periodos.push(periodo);
    }
    return periodos;
}

function normalizeString(str) {
    return str.replace(/\w\S*/g, function(txt) {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    }).replace(/ E /g, " e ").replace(/ De /g, " de ").replace(/ Do /g, " do ").replace(/ Da /g, " da ").replace(/ À /g, " à ").replace(/ A /g, " a ");
}

function parseHTML(html) {
    return html.replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&iexcl;/g, "¡").replace(/&cent;/g, "¢").replace(/&pound;/g, "£").replace(/&curren;/g, "¤").replace(/&yen;/g, "¥").replace(/&brvbar;/g, "¦").replace(/&sect;/g, "§").replace(/&uml;/g, "¨").replace(/&copy;/g, "©").replace(/&ordf;/g, "ª").replace(/&laquo;/g, "«").replace(/&not;/g, "¬").replace(/&reg;/g, "®").replace(/&macr;/g, "¯").replace(/&deg;/g, "°").replace(/&plusmn;/g, "±").replace(/&sup2;/g, "²").replace(/&sup3;/g, "³").replace(/&acute;/g, "´").replace(/&micro;/g, "µ").replace(/&para;/g, "¶").replace(/&middot;/g, "·").replace(/&cedil;/g, "¸").replace(/&sup1;/g, "¹").replace(/&ordm;/g, "º").replace(/&raquo;/g, "»").replace(/&frac14;/g, "¼").replace(/&frac12;/g, "½").replace(/&frac34;/g, "¾").replace(/&iquest;/g, "¿").replace(/&times;/g, "×").replace(/&divide;/g, "÷").replace(/&Agrave;/g, "À").replace(/&Aacute;/g, "Á").replace(/&Acirc;/g, "Â").replace(/&Atilde;/g, "Ã").replace(/&Auml;/g, "Ä").replace(/&Aring;/g, "Å").replace(/&AElig;/g, "Æ").replace(/&Ccedil;/g, "Ç").replace(/&Egrave;/g, "È").replace(/&Eacute;/g, "É").replace(/&Ecirc;/g, "Ê").replace(/&Euml;/g, "Ë").replace(/&Igrave;/g, "Ì").replace(/&Iacute;/g, "Í").replace(/&Icirc;/g, "Î").replace(/&Iuml;/g, "Ï").replace(/&ETH;/g, "Ð").replace(/&Ntilde;/g, "Ñ").replace(/&Ograve;/g, "Ò").replace(/&Oacute;/g, "Ó").replace(/&Ocirc;/g, "Ô").replace(/&Otilde;/g, "Õ").replace(/&Ouml;/g, "Ö").replace(/&Oslash;/g, "Ø").replace(/&Ugrave;/g, "Ù").replace(/&Uacute;/g, "Ú").replace(/&Ucirc;/g, "Û").replace(/&Uuml;/g, "Ü").replace(/&Yacute;/g, "Ý").replace(/&THORN;/g, "Þ").replace(/&szlig;/g, "ß").replace(/&agrave;/g, "à").replace(/&aacute;/g, "á").replace(/&acirc;/g, "â").replace(/&atilde;/g, "ã").replace(/&auml;/g, "ä").replace(/&aring;/g, "å").replace(/&aelig;/g, "æ").replace(/&ccedil;/g, "ç").replace(/&egrave;/g, "è").replace(/&eacute;/g, "é").replace(/&ecirc;/g, "ê").replace(/&euml;/g, "ë").replace(/&igrave;/g, "ì").replace(/&iacute;/g, "í").replace(/&icirc;/g, "î").replace(/&iuml;/g, "ï").replace(/&eth;/g, "ð").replace(/&ntilde;/g, "ñ").replace(/&ograve;/g, "ò").replace(/&oacute;/g, "ó").replace(/&ocirc;/g, "ô").replace(/&otilde;/g, "õ").replace(/&ouml;/g, "ö").replace(/&oslash;/g, "ø").replace(/&ugrave;/g, "ù").replace(/&uacute;/g, "ú").replace(/&ucirc;/g, "û").replace(/&uuml;/g, "ü").replace(/&yacute;/g, "ý").replace(/&thorn;/g, "þ").replace(/&yuml;/g, "ÿ").replace(/&nbsp;/g, " ").trim();
}

function getBetweenStrings(text, textFrom, textTo) {
    var result = "";
    result = text.substring(text.indexOf(textFrom) + textFrom.length, text.length);
    result = result.substring(0, result.indexOf(textTo));
    return result;
}

function disparaNotificacao(mensagem) {
    var response = UrlFetchApp.fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        contentType: 'application/json',
        headers: {
            Authorization: 'key=Your FCM key'
        },
        payload: JSON.stringify({
            notification: {
                title: mensagem
            },
            to: '/topics/notifs'
        })
    });
}



function getFbInstance() {
    var token = ScriptApp.getOAuthToken();
    return FirebaseApp.getDatabaseByUrl("your real time database url", token);
}

function saveToFirebase(user) {
    var fb = getFbInstance();
    fb.setData("users/" + user.cpf, user);
}
