import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type {
  ResetPasswordByEmailDto,
  SendResetCodeDto,
} from '../user/dto/extra.dto';
import type { AuthUser } from '../user/type/user.types';
import { UserService } from '../user/user.service';
import {
  RESET_CODE_COOLDOWN_SECONDS,
  RESET_CODE_TTL_SECONDS,
} from './constants/auth.constants';
import type { LoginDto, RegisterDto } from './dto/auth.dto';
import { EmailActivationService } from './email-activation.service';
import { EmailService } from './email.service';
import { PasswordResetService } from './password-reset.service';
import type { LoginResult, TokenPayload } from './type/auth.types';

@Injectable()
class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
    private readonly emailActivation: EmailActivationService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  /** 配置了 AUTH_BOOTSTRAP_ADMIN_* 时确保初始管理员存在（已存在则不改） */
  async onModuleInit(): Promise<void> {
    const username = this.config.get<string>('AUTH_BOOTSTRAP_ADMIN_USERNAME');
    const password = this.config.get<string>('AUTH_BOOTSTRAP_ADMIN_PASSWORD');
    const email = this.config.get<string>('AUTH_BOOTSTRAP_ADMIN_EMAIL');
    if (!username || !password || !email) {
      return;
    }
    if (
      await this.userService.ensureBootstrapAdmin(username, password, email)
    ) {
      this.logger.log(`已创建初始管理员：username=${username}`);
    }
  }

  private accessExpires(): string {
    return this.config.get<string>('JWT_ACCESS_EXPIRES', '2h');
  }

  private refreshExpires(): string {
    return this.config.get<string>('JWT_REFRESH_EXPIRES', '7d');
  }

  private accessExpiresSeconds(): number {
    const raw = this.accessExpires();
    const match = /^(\d+)([smhd])$/.exec(raw);
    if (!match) return 7200;
    const n = Number(match[1]);
    const unit = match[2];
    if (unit === 's') return n;
    if (unit === 'm') return n * 60;
    if (unit === 'h') return n * 3600;
    return n * 86400;
  }

  private requireEmailVerification(): boolean {
    return (
      this.config.get<string>('REQUIRE_EMAIL_VERIFICATION', 'false') === 'true'
    );
  }

  private signAccessToken(user: AuthUser): string {
    const payload: TokenPayload = {
      sub: user.userId,
      username: user.username,
      type: 'access',
    };
    return this.jwtService.sign(payload, {
      expiresIn: this.accessExpires() as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });
  }

  private signRefreshToken(user: AuthUser): string {
    const payload: TokenPayload = {
      sub: user.userId,
      username: user.username,
      type: 'refresh',
    };
    return this.jwtService.sign(payload, {
      expiresIn: this.refreshExpires() as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });
  }

  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await this.userService.validateCredentials(
      dto.username,
      dto.password,
    );
    await this.userService.touchLastLogin(user.userId);
    return this.buildLoginResult(user);
  }

  async register(dto: RegisterDto): Promise<{
    userId: string;
    message: string;
    emailVerificationRequired?: boolean;
  }> {
    const result = await this.userService.register({
      ...dto,
      requireEmailVerification: this.requireEmailVerification(),
    });

    if (result.emailVerificationRequired && dto.email) {
      const token = await this.emailActivation.createToken(result.userId);
      try {
        await this.emailService.sendActivationEmail(
          dto.email,
          dto.username,
          token,
        );
      } catch {
        await this.emailActivation.deleteByToken(token);
        throw new BadRequestException('激活邮件发送失败，请稍后再试');
      }
      return {
        userId: result.userId,
        message: '注册成功，请查收邮件激活账户',
        emailVerificationRequired: true,
      };
    }

    return {
      userId: result.userId,
      message: '注册成功，请登录',
    };
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const userId = await this.emailActivation.consumeToken(token);
    if (!userId) {
      throw new BadRequestException('激活链接无效或已过期');
    }
    const message = await this.userService.activateEmail(userId);
    return { message };
  }

  async sendResetCode(dto: SendResetCodeDto): Promise<{ message: string }> {
    const user = await this.userService.findByEmail(dto.email);
    if (!user) {
      throw new NotFoundException('该邮箱未注册');
    }

    // Redis 剩余 TTL：刚发出去时约 600s。剩余 > 540s 说明距上次发送不足 60s，拦截重复发送
    const ttl = await this.passwordReset.getTtl(dto.email);
    if (ttl > RESET_CODE_TTL_SECONDS - RESET_CODE_COOLDOWN_SECONDS) {
      throw new BadRequestException('验证码已发送，请稍后再试');
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await this.passwordReset.set(dto.email, code);
    try {
      await this.emailService.sendResetCodeEmail(
        dto.email,
        user.username,
        code,
      );
    } catch {
      await this.passwordReset.delete(dto.email);
      throw new BadRequestException('邮件发送失败，请稍后再试');
    }
    return { message: '验证码已发送' };
  }

  async resetPasswordByEmail(
    dto: ResetPasswordByEmailDto,
  ): Promise<{ message: string }> {
    if (!(await this.passwordReset.verify(dto.email, dto.code))) {
      // 输错累计 3 次作废验证码，需重新获取
      const locked = await this.passwordReset.recordFailedAttempt(dto.email);
      throw new BadRequestException(
        locked ? '验证码错误次数过多，请重新获取' : '验证码错误或已过期',
      );
    }
    await this.userService.resetPasswordByEmail(dto.email, dto.newPassword);
    await this.passwordReset.delete(dto.email);
    return { message: '密码重置成功，请登录' };
  }

  async refresh(refreshToken: string): Promise<LoginResult> {
    let payload: TokenPayload;
    try {
      payload = this.jwtService.verify<TokenPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('refresh token 无效或已过期');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('无效的 refresh token');
    }
    const user = await this.userService.buildAuthUser(payload.sub);
    return this.buildLoginResult(user);
  }

  async getMe(userId: string): Promise<AuthUser> {
    return this.userService.buildAuthUser(userId);
  }

  async buildAuthUser(userId: string): Promise<AuthUser> {
    return this.userService.buildAuthUser(userId);
  }

  async getReviewerIds(): Promise<string[]> {
    return this.userService.getUserIdsByRoleCode('ROLE_REVIEWER');
  }

  private buildLoginResult(user: AuthUser): LoginResult {
    return {
      accessToken: this.signAccessToken(user),
      refreshToken: this.signRefreshToken(user),
      tokenType: 'Bearer',
      expiresIn: this.accessExpiresSeconds(),
      userInfo: user,
    };
  }
}

export { AuthService };
