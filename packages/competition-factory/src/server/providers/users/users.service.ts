import { TEST_EMAIL, TEST_PASSWORD } from '@Server/common/constants/test';
import { Injectable } from '@nestjs/common';

type User = {
  userId: number;
  email: string;
  password: string;
  roles: string[];
};

@Injectable()
export class UsersService {
  private readonly users = [
    {
      userId: 1,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      roles: ['admin', 'client'],
    },
  ];

  async findOne(email: string): Promise<User | undefined> {
    return this.users.find((user) => user.email === email);
  }
}
