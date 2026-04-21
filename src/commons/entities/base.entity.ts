import { ApiProperty } from '@nestjs/swagger';
import { BeforeInsert, Column, PrimaryColumn } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

export class BaseEntity {
  @ApiProperty()
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv7();
    }
  }

  @ApiProperty()
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

}
