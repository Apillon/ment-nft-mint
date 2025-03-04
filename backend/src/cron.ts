import { CronJob } from "cron";
import { AirdropStatus } from "./models/user";
import { dateToSqlString } from "./lib/sql-utils";
import { SqlModelStatus } from "./models/base-sql-model";
import { MysqlConnectionManager } from "./lib/mysql-connection-manager";
import { SmtpSendTemplate } from "./lib/node-mailer";
import { env } from "./config/env";
import { generateEmailAirdropToken } from "./lib/jwt";
import { LogType, writeLog } from "./lib/logger";

export class Cron {
  private cronJobs: CronJob[] = [];

  constructor() {
    this.cronJobs.push(new CronJob("* * * * *", this.sendEmail, null, false));
    if (env.MAX_SUPPLY > 0) {
      this.cronJobs.push(
        new CronJob("* * * * *", this.processExpiredClaims, null, false)
      );
    }
  }

  async start() {
    for (const cronJob of this.cronJobs) {
      cronJob.start();
    }
  }

  async stop() {
    for (const cronJob of this.cronJobs) {
      cronJob.stop();
    }
    await MysqlConnectionManager.destroyInstance();
  }

  async sendEmail() {
    const mysql = await MysqlConnectionManager.getInstance();

    let availableNftLeft = 0;
    if (env.MAX_SUPPLY) {
      const res = await mysql.paramExecute(
        `SELECT COUNT(id) as total FROM user WHERE
          airdrop_status IN (
            ${AirdropStatus.EMAIL_SENT},
            ${AirdropStatus.WALLET_LINKED},
            ${AirdropStatus.TRANSACTION_CREATED},
            ${AirdropStatus.AIRDROP_COMPLETED},
            ${AirdropStatus.IN_WAITING_LINE}
          )
          AND status = ${SqlModelStatus.ACTIVE}
        ;
       `
      );
      const numOfReservations = res[0].total;
      availableNftLeft = env.MAX_SUPPLY - numOfReservations;
    }

    const conn = await mysql.start();

    try {
      const users = await mysql.paramExecute(
        `SELECT * FROM user WHERE
          airdrop_status = ${AirdropStatus.PENDING}
          AND status = ${SqlModelStatus.ACTIVE}
          AND email_start_send_time < '${dateToSqlString(new Date())}'
          FOR UPDATE
        ;
       `,
        null,
        conn
      );

      const updates = [];

      for (let i = 0; i < users.length; i++) {
        try {
          if (!env.MAX_SUPPLY || i < availableNftLeft) {
            const token = await generateEmailAirdropToken(users[i].email);
            await SmtpSendTemplate(
              [users[i].email],
              "Claim your MENT token",
              "en-airdrop-claim",
              {
                appUrl: env.APP_URL,
                link: `${env.APP_URL}/claim?token=${token}`,
                claimExpiresIn: env.CLAIM_EXPIRES_IN,
              },
              "MENT"
            );
            updates.push(
              `(${users[i].id}, '${users[i].email}', ${
                AirdropStatus.EMAIL_SENT
              }, '${dateToSqlString(new Date())}')`
            );
          } else {
            //Currently, waiting line for airdrop is full.Send info email and set appropriate status
            await SmtpSendTemplate(
              [users[i].email],
              "You have been placed on a waitlist for MENT token",
              "en-airdrop-waiting-line",
              {
                appUrl: env.APP_URL,
              },
              "MENT"
            );
            updates.push(
              `(${users[i].id}, '${users[i].email}', ${
                AirdropStatus.IN_WAITING_LINE
              }, '${dateToSqlString(new Date())}')`
            );
          }
        } catch (e) {
          writeLog(LogType.ERROR, e, "cron.ts", "sendEmail");
          updates.push(
            `(${users[i].id}, '${users[i].email}', ${
              AirdropStatus.EMAIL_ERROR
            }, '${dateToSqlString(new Date())}')`
          );
        }
      }

      if (updates.length > 0) {
        const sql = `
        INSERT INTO user (id, email, airdrop_status, email_sent_time)
        VALUES ${updates.join(",")}
        ON DUPLICATE KEY UPDATE
        airdrop_status = VALUES(airdrop_status),
        email_sent_time = VALUES(email_sent_time)`;

        await mysql.paramExecute(sql, null, conn);
      }

      await mysql.commit(conn);
    } catch (e) {
      writeLog(LogType.ERROR, e, "cron.ts", "sendEmail");
      await mysql.rollback(conn);
    }
  }

  async processExpiredClaims() {
    const mysql = await MysqlConnectionManager.getInstance();
    const conn = await mysql.start();

    try {
      const usersWithExpiredClaim = (
        await mysql.paramExecute(
          `SELECT * FROM user WHERE
          airdrop_status = ${AirdropStatus.EMAIL_SENT}
          AND status = ${SqlModelStatus.ACTIVE}
          AND DATE_ADD(email_sent_time, INTERVAL ${env.CLAIM_EXPIRES_IN} HOUR) < NOW()
          FOR UPDATE
        ;
       `,
          null,
          conn
        )
      ).map((x) => x.id);

      if (usersWithExpiredClaim.length) {
        //Update those users to claim expired
        await mysql.paramExecute(
          `UPDATE user 
          SET airdrop_status = ${AirdropStatus.AIRDROP_CLAIM_EXPIRED}
          WHERE id IN (${usersWithExpiredClaim.join(",")})
        ;
       `,
          null,
          conn
        );
        console.info(
          usersWithExpiredClaim.length +
            " users updated to AIRDROP_CLAIM_EXPIRED"
        );

        //Get users in waiting line and set their airdrop status to PENDING, so that they will recieve email for claim
        const usersInWaitingLine = await mysql.paramExecute(
          `SELECT * FROM user WHERE
          airdrop_status = ${AirdropStatus.IN_WAITING_LINE}
          AND status = ${SqlModelStatus.ACTIVE}
          ORDER BY createTime ASC
          LIMIT ${usersWithExpiredClaim.length}
          FOR UPDATE
        ;
       `,
          null,
          conn
        );

        console.info(
          "Num of users in waiting line: " + usersInWaitingLine.length
        );

        if (usersInWaitingLine.length) {
          await mysql.paramExecute(
            `UPDATE user 
                SET 
                airdrop_status = ${AirdropStatus.EMAIL_SENT},
                email_sent_time = NOW()
                WHERE id IN (${usersInWaitingLine.map((x) => x.id).join(",")})
              ;
            `,
            null,
            conn
          );
          console.info(
            usersInWaitingLine.map((x) => x.id).join(",") +
              " should me moved from waiting line. Sending emails...."
          );

          for (const user of usersInWaitingLine) {
            try {
              const token = await generateEmailAirdropToken(user.email);
              await SmtpSendTemplate(
                [user.email],
                "Claim your MENT token",
                "en-airdrop-claim",
                {
                  appUrl: env.APP_URL,
                  link: `${env.APP_URL}/claim?token=${token}`,
                  claimExpiresIn: env.CLAIM_EXPIRES_IN,
                },
                "MENT"
              );
            } catch (err) {
              await mysql.paramExecute(
                `UPDATE user 
                  SET airdrop_status = ${AirdropStatus.EMAIL_ERROR},
                  WHERE id = ${user.id})
              ;
            `,
                null,
                conn
              );
            }
          }
        }
      }

      await mysql.commit(conn);
    } catch (e) {
      writeLog(LogType.ERROR, e, "cron.ts", "processExpiredClaims");
      await mysql.rollback(conn);
    }
  }
}
