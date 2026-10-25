import { Module } from '@nestjs/common';
import { PageModule } from '../page/page.module';
import { PageAccessModule } from '../page/page-access/page-access.module';
import { CollectionController } from './collection.controller';
import { ItemController } from './item.controller';
import { CollectionService } from './collection.service';

// CollectionRepo / ItemRepo / PageRepo come from the global DatabaseModule.
@Module({
  imports: [PageModule, PageAccessModule],
  controllers: [CollectionController, ItemController],
  providers: [CollectionService],
  exports: [CollectionService],
})
export class CollectionModule {}
