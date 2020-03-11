const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const bodyParser = require("body-parser");
const Db = require("./utils/db");
const Bitrix = require("./utils/bitrix");
const avatar = require("./utils/avatar");

require("dotenv").config();

const app = express();

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");
app.use(bodyParser.urlencoded());
app.use(bodyParser.json());
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

let bitrix = new Bitrix();

app.use(async (req, res, next) => {
  if (req.body.event) {
    let result;
    // const configs = Db.getConfigs();
    switch (req.body.event) {
      case "ONIMBOTMESSAGEADD":
        console.log("ONIMBOTMESSAGEADD event with body: ", req.body);
        const marketingUsers = bitrix.getMarketingUsers();
        let eventMessage = req.body["data"]["PARAMS"]["MESSAGE"];
        if (marketingUsers.length === 1 && marketingUsers[0] === "1819") {
          console.log("Marketing group error. Use only 1819");
          result = await bitrix.sendMessage(
            req.body["data"]["PARAMS"]["FROM_USER_ID"],
            `Ошибка группы маркетинга`,
            req.body["auth"],
          );
          result = await bitrix.sendMessage(
            "1819",
            `Ошибка группы маркетинга`,
            req.body["auth"],
          );
          break;
        }
        // check the event - authorize this event or not
        if (!bitrix.checkAuth(req.body["auth"]["application_token"])) {
          console.log("Unauthorized event: ", req.body.event);
          return false;
        }
        if (!marketingUsers.includes(req.body["data"]["PARAMS"]["FROM_USER_ID"])) {
          //Message from common user
          console.log("Message from common user: ", eventMessage);
          let attach = [];
          if (req.body["data"]["PARAMS"]["FILES"]) {
            //Message has files
            console.log("There are files in message: ", req.body["data"]["PARAMS"]["FILES"]);
            const filesKeys = Object.keys(req.body["data"]["PARAMS"]["FILES"]);
            console.log("filesKeys: ", filesKeys);
            //Attach files
            for(let i = 0; i < filesKeys.length; i++) {
              const fileUrl = await bitrix.getFileUrl( req.body["data"]["PARAMS"]["FILES"][filesKeys[i]]["id"],  req.body["auth"]);
              const fileName = req.body["data"]["PARAMS"]["FILES"][filesKeys[i]]["name"];
              const fileSize = req.body["data"]["PARAMS"]["FILES"][filesKeys[i]]["size"];
              console.log("File url: ", fileUrl);
              console.log("File name: ", fileName);
              console.log("File size: ", fileSize);
              attach.push({ FILE: {
                              NAME: fileName,
                              LINK: fileUrl,
                              SIZE: fileSize,
                            }
                          }   
              );
            }
          }
          if (eventMessage === undefined) {
            console.log("Empty message");
          }
          //Send incoming msg to all marketing group
          for (let i = 0; i < marketingUsers.length; i++) {
            if (marketingUsers[i] == null) continue;
            if(!eventMessage) {
              eventMessage = "";
            }
            console.log(
              `Sending message from common user to ${marketingUsers[i]}`,
            );
            result = await bitrix.sendMessage(
              marketingUsers[i],
              `${req.body["data"]["USER"]["NAME"]} id${req.body["data"]["USER"]["ID"]}: ${eventMessage}`,
              req.body["auth"],
              attach
            );
          }
        } else {
          //Message from marketing group
          console.log("Message from marketing group");
          if (req.body["data"]["PARAMS"]["FILES"]) {
            //Message has files
            console.log("There are files in message from marketing, so error");
            result = await bitrix.sendMessage(
              req.body["data"]["USER"]["ID"],
              `Отправка файлов у вас не работает. Сообщение не отправлено`,
              req.body["auth"],
            );
            break;
          }
          if ( !req.body["data"]["PARAMS"]["MESSAGE"].match(/(?<=id)\d*/gm) ) {
            //Quotation error
            console.log(
              "Quotation error in: ",
              req.body["data"]["PARAMS"]["MESSAGE"],
            );
            result = await bitrix.sendMessage(
              req.body["data"]["PARAMS"]["FROM_USER_ID"],
              `Ошибка цитаты`,
              req.body["auth"],
            );
            break;
          }
          
          let eventMessage = req.body["data"]["PARAMS"]["MESSAGE"];
          if(!eventMessage) {
            eventMessage = "";
          }
          const toUserId = eventMessage.match(/(?<=id)\d*/gm)[0];
          console.log("Find user id for response: ", toUserId);
          //Answer to user
          result = await bitrix.sendMessage(
            toUserId,
            `${req.body["data"]["USER"]["NAME"]}: ${eventMessage}`,
            req.body["auth"]
          );
          //Answer to other marketing
          for (let i = 0; i < marketingUsers.length; i++) {
            if (marketingUsers[i] == null) continue;
            if (marketingUsers[i] === req.body["data"]["USER"]["ID"]) continue;
            console.log("Duplicate Answer to ", marketingUsers[i]);
            result = await bitrix.sendMessage(
              marketingUsers[i],
              `${req.body["data"]["USER"]["NAME"]}: ${eventMessage}`,
              req.body["auth"]
            );
          }
        }
        break;
      case "ONAPPINSTALL":
        console.log("ONAPPINSTALL event with body: ", req.body);
        // register new bot
        await bitrix.registerBotAndCommands(
          req.body["auth"]["application_token"],
          req.body["auth"],
        );
        break;
      case "ONIMCOMMANDADD":
        console.log("Event ONIMCOMMANDADD with body: ", req.body);
        console.log(
          "Event ONIMCOMMANDADD with body[data][COMMAND]: ",
          req.body["data"]["COMMAND"],
        );
        // check the event - authorize this event or not
        if (!bitrix.checkAuth(req.body["auth"]["application_token"])) {
          console.log("Unauthorized event: ", req.body.event);
          return false;
        }
        
        result = false;
        for (const command of req.body["data"]["COMMAND"]) {
          if (command["COMMAND"] === "рассылкамаркетинг") {
            const departmentToSearch = command["COMMAND_PARAMS"].match(
              /^.*(?=-)/gm,
            )[0];
            const msg = command["COMMAND_PARAMS"].match(/(?<=-).*/gm)[0];
            //TODO Handle match errors
            console.log("Department to search: ", departmentToSearch);
            console.log("Message to mass send: ", msg);
            const users = await bitrix.searchUsersByDepartment(
              departmentToSearch,
              req.body["auth"],
            );
            const usersIds = Object.keys(users);
            console.log("Users to mass send: ", users);
            for (let i = 0; i < usersIds.length; i++) {
              result = await bitrix.sendMessage(
                usersIds[i],
                `Рассылка от ${req.body["data"]["USER"]["NAME"]}: ${msg}`,
                req.body["auth"]
              );
            }
            result = await bitrix.commandAnswer(
              command["COMMAND_ID"],
              command["MESSAGE_ID"],
              `Ответ на команду /${command["COMMAND"]} ${departmentToSearch}-${msg}`,
              [
                {
                  MESSAGE: `Разослано пользователям:\n ${Object.keys(users).map(
                    key => `${users[key].name}\n`,
                  )}`,
                },
              ],
              req.body["auth"]
            );
          } else if(command["COMMAND"] === "addmarketinguser") {
            console.log(
              "Got command addmarketinguser: ",
              command["COMMAND_PARAMS"],
            );
            const addUserResult = bitrix.addMarketingUser(
              command["COMMAND_PARAMS"]
            );
			result = await bitrix.commandAnswer(
              command["COMMAND_ID"],
              command["MESSAGE_ID"],
              `Ответ на команду /${command["COMMAND"]} ${command["COMMAND_PARAMS"]}`,
              [
                {
                  MESSAGE: `Пользователи маркетинга:\n ${bitrix.getMarketingUsers().map(id => `${id}\n`)}`,
                },
              ],
              req.body["auth"],
            );
          } else if(command["COMMAND"] === "deletemarketinguser") {
            console.log("Got command deletemarketinguser");
            const idToDelete = command["COMMAND_PARAMS"];
            console.log("Gonna delete marketing user: ", idToDelete);
            const deleteUserResult = bitrix.deleteMarketingUser(idToDelete);
            result = await bitrix.commandAnswer(
              command["COMMAND_ID"],
              command["MESSAGE_ID"],
              `Ответ на команду /${command["COMMAND"]} ${command["COMMAND_PARAMS"]}`,
              [
                {
                  MESSAGE: `Пользователи маркетинга:\n ${bitrix
                    .getMarketingUsers()
                    .map(id => `${id}\n`)}`,
                },
              ],
              req.body["auth"],
            );
          }
        }
        break;
      default:
        console.log("Unidentified event: ", req.body.event);
        break;
    }
  } else {
    console.log("New unidentified request: ", req.body);
  }
  res.sendStatus(200);
});

module.exports = app;

//  body:  {
//   event: 'ONIMBOTMESSAGEADD',
//   data: {
//     BOT: { '1823': [Object] },
//     PARAMS: {
//       FROM_USER_ID: '1514',
//       TO_USER_ID: '1823',
//       MESSAGE: 'd',
//       MESSAGE_TYPE: 'P',
//       SKIP_COMMAND: 'N',
//       SKIP_CONNECTOR: 'N',
//       IMPORTANT_CONNECTOR: 'N',
//       SILENT_CONNECTOR: 'N',
//       AUTHOR_ID: '1514',
//       CHAT_ID: '3295',
//       COMMAND_CONTEXT: 'TEXTAREA',
//       DIALOG_ID: '1514',
//       MESSAGE_ID: '120044',
//       CHAT_TYPE: 'P',
//       LANGUAGE: 'ru'
//     },
//     USER: {
//       ID: '1514',
//       NAME: 'Евгений Хайдаршин',
//       FIRST_NAME: 'Евгений',
//       LAST_NAME: 'Хайдаршин',
//       WORK_POSITION: '',
//       GENDER: 'M',
//       IS_BOT: 'N',
//       IS_CONNECTOR: 'N',
//       IS_NETWORK: 'N',
//       IS_EXTRANET: 'N'
//     }
//   },
//   ts: '1582651907',
//   auth: {
//     access_token: '1368555e0044d864003dc5b4000005ea0000039e16fdb8f7ae622e680bcc4651361662',
//     expires: '1582655507',
//     expires_in: '3600',
//     scope: 'imopenlines,crm,im,imbot,task,tasks_extended,placement,user,entity,pull,pull_channel,mobile,log,messageservice,lists,disk,department',
//     domain: 'bitrix24.inari.pro',
//     server_endpoint: 'https://oauth.bitrix.info/rest/',
//     status: 'L',
//     client_endpoint: 'https://bitrix24.inari.pro/rest/',
//     member_id: '7126572dc5d37d6e261e584c932fdfed',
//     user_id: '1514',
//     refresh_token: '03e77c5e0044d864003dc5b4000005ea00000380fa1baaafefa56d45625b7f97e79973',
//     application_token: 'c6e4c9018ccef1af374cc701f90fe688'
//   }
// }

// MESSAGE: '------------------------------------------------------\n' +
//         'Test factory support [вчера, 21:42]\n' +
//         'Сообщение от Евгений Хайдаршин: dfdfggd\n' +
//         '------------------------------------------------------\n' +
//         'С цитатой',

// --------------------------------------------------------------------------------------------------------------------------------------
// [COMMAND] => Array // Массив команд, которые были вызваны пользователем
// (
//     [14] => Array
//     (
//       [AUTH] => Array // Параметры для авторизации под чат-ботом для выполнения действий
//       (
//          [domain] => b24.hazz
//          [member_id] => d41d8cd98f00b204e9800998ecf8427e
//          [application_token] => 8006ddd764e69deb28af0c768b10ed65
//       )
//       [BOT_ID] => 62 // Идентификатор чат-бота
//       [BOT_CODE] => echobot // Код чат-бота
//       [COMMAND] => echo // Вызванная команда
//       [COMMAND_ID] => 14 // Идентификатор команды
//       [COMMAND_PARAMS] => test // Параметры, с которыми была вызвана команда
//       [COMMAND_CONTEXT] => TEXTAREA // Контекст выполнения команды. TEXTAREA, если команда введена руками, или KEYBOARD, если нажал на кнопку в клавиатуре
//       [MESSAGE_ID] => 1221 // Идентификатор сообщения, на которое необходимо ответить
//     )
// )
// [PARAMS] => Array // Массив данных сообщения
// (
//     [DIALOG_ID] => 1    // Идентифкатор диалога
//     [CHAT_TYPE] => P    // Тип сообщения и чата, может быть P (чат один-на-один), C (с ограниченным количеством участников), O (публичный чат)
//     [MESSAGE_ID] => 1221 // Идентификатор сообщения
//     [MESSAGE] => /echo test // Сообщение
//     [MESSAGE_ORIGINAL] => /echo test // Оригинальное сообщение с BB-кодом бота (параметр доступен только в групповых чатах)
//     [FROM_USER_ID] => 1 // Идентификатор пользователя отправившего сообщение
//     [TO_USER_ID] => 2 // Идентификатор другого пользователя (параметр доступен только в чатах один-на-один)
//     [TO_CHAT_ID] => 6   // Идентификатор чата (параметр доступен только в групповых чатах)
//     [LANGUAGE] => ru    // Идентификатор языка портала по умолчанию
// )
// [USER] => Array // Массив данных автора сообщения, может быть пустым, если ID = 0
// (
//     [ID] => 1 // Идентификатор пользователя
//     [NAME] => Евгений Шеленков // Имя и фамилия пользователя
//     [FIRST_NAME] => Евгений // Имя пользователя
//     [LAST_NAME] => Шеленков // Фамилия пользователя
//     [WORK_POSITION] => // Занимаемая должность
//     [GENDER] => M // Пол, может быть либо M (мужской), либо F (женский)
// )


// There are files in message:  {
//   '273896': {
//     id: '273896',
//     chatId: '3313',
//     type: 'image',
//     name: 'app.PNG',
//     extension: 'png',
//     size: '24719',
//     image: { width: '0', height: '0' },
//     status: 'upload',
//     progress: '-1',
//     authorId: '1514',
//     authorName: 'Евгений Хайдаршин',
//     urlPreview: '',
//     urlShow: '',
//     urlDownload: '',
//     viewerAttrs: {
//       viewerType: 'image',
//       src: '',
//       viewerGroupBy: '3313',
//       title: 'app.PNG',
//       actions: '[{"type":"download"},{"type":"copyToMe","text":"\\u0421\\u043e\\u0445\\u0440\\u0430\\u043d\\u0438\\u0442\\u044c \\u043d\\u0430 \\u0411\\u0438\\u0442\\u0440\\u0438\\u043a\\u044124.\\u0414\\u0438\\u0441\\u043a","action":"BXIM.disk.saveToDiskAction","params":{"fileId":"273896"},"extension":"disk.viewer.actions","buttonIconClass":"ui-btn-icon-cloud"}]'
//     }
//   }
// }