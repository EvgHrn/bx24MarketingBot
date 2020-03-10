const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");

require("dotenv").config();

const adapter = new FileSync("db.json");
const dblow = low(adapter);

class Db {
  static getMarketingUsers = () => {
    try {
      dblow.read();
      const marketingUsers = dblow.getState().marketingUsers;
      if (marketingUsers === undefined) return false;
      return marketingUsers;
    } catch (err) {
      return false;
    }
	};
	
  static addMarketingUser = (user) => {
    if (!user) return false;
    let marketingUsers;
    try {
      dblow.read();
      marketingUsers = dblow.getState().marketingUsers;
      if (marketingUsers === undefined) {
        marketingUsers = ["1819"];
      }
      marketingUsers.push(user);
      dblow.set("marketingUsers", marketingUsers).write();
      const savedMarketingUsers = this.getMarketingUsers();
      if (savedMarketingUsers === false) return false;
      return savedMarketingUsers;
    } catch (err) {
      return false;
    }
  };

  static deleteMarketingUser = (user) => {
    if (!user) return false;
    let marketingUsers;
    try {
      dblow.read();
      marketingUsers = dblow.getState().marketingUsers;
      if (marketingUsers === undefined) {
        return false;
      }
      marketingUsers = marketingUsers.filter(
        marketingUser => marketingUser !== user,
      );
      dblow.set("marketingUsers", marketingUsers).write();
      const savedMarketingUsers = this.getMarketingUsers();
      if (savedMarketingUsers === false) return false;
      return savedMarketingUsers;
    } catch (err) {
      return false;
    }
  };

  static saveConfig = config => {
    console.log("Gonna save new config: ", config);
    try {
      dblow
        .get("configs")
        .push(config)
        .write();
      console.log("New config successfully saved");
      return true;
    } catch (err) {
      console.log("Saving config error");
      return false;
    }
  };

	static getConfigs = () => {
		let configs;
		try {
			dblow.read();
      configs = dblow.getState().configs;
      console.log("dblow.getState(): ", dblow.getState());
      // console.log("dblow.getState().configs: ", dblow.getState().configs);
			if (configs === undefined) {
				dblow.set("configs", []).write();
				configs = [];
			}
		} catch (err) {
			console.log("Getting configs from db error: ", err);
			console.log("Reset config");
			dblow.set("configs", []).write();
			configs = [];
		}
		return configs;
	};

}

module.exports = Db;
