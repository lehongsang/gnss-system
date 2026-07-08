import {
  Injectable,
  PipeTransform,
  ArgumentMetadata,
} from '@nestjs/common';

/**
 * Pipe toàn cục để làm sạch dữ liệu request.
 * Tự động chuyển chuỗi rỗng ('') và chuỗi 'null' thành undefined.
 * Vì Pipe chạy SAU Interceptor (như FileInterceptor), nên nó dọn sạch
 * body do Multer tạo ra trước khi validate diễn ra.
 */
@Injectable()
export class SanitizeRequestPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    // Chỉ sanitize dữ liệu body
    if (metadata.type === 'body' && value && typeof value === 'object') {
      return this.sanitize(value);
    }
    return value;
  }

  private sanitize(obj: unknown): unknown {
    if (Array.isArray(obj)) {
      return obj.map((v: unknown) => this.sanitize(v));
    }

    if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
      // Kiểm tra property 'buffer' để bỏ qua object File của Multer, tránh sanitize nhầm
      if ('buffer' in obj) {
        return obj;
      }

      const record = obj as Record<string, unknown>;
      Object.keys(record).forEach((key) => {
        const val = record[key];

        if (val === '' || val === 'null') {
          record[key] = undefined;
        } else if (val !== null && typeof val === 'object') {
          record[key] = this.sanitize(val);
        }
      });
    }

    return obj;
  }
}
