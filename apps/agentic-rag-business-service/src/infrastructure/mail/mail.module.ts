import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';

/** SMTP 邮件（@nestjs-modules/mailer + nodemailer）；MailerService 全局可注入 */
@Module({
  imports: [
    MailerModule.forRootAsync({
      // MailerAsyncOptions 类型要求 imports；ConfigModule 已全局注册，这里留空
      imports: [],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        transport: {
          host: configService.get<string>('MAIL_HOST'),
          port: Number(configService.get<string>('MAIL_PORT')),
          secure: configService.get<string>('MAIL_SECURE') === 'true',
          auth: {
            user: configService.get<string>('MAIL_USER'),
            pass: configService.get<string>('MAIL_PASS'),
          },
        },
        defaults: {
          from: configService.get<string>('MAIL_FROM'),
        },
      }),
    }),
  ],
})
class MailModule {}

export { MailModule };
