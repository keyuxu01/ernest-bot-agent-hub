import { SetMetadata } from '@nestjs/common';

const IS_PUBLIC_KEY = 'isPublic';

/** 标记接口无需 JWT（login / register / refresh 等） */
const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export { IS_PUBLIC_KEY, Public };
