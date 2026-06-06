package tech.pritamrao.kkrhms.common;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.repository.*;
import tech.pritamrao.kkrhms.service.*;
import tech.pritamrao.kkrhms.dto.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.security.*;

import org.springframework.data.domain.Page;

import java.util.List;
import java.util.function.Function;

/**
 * Pagination envelope mirroring the original API: {@code total / page / pageSize
 * / totalPages} alongside the rows. The rows key (e.g. {@code users},
 * {@code patients}) is supplied by each controller.
 */
public record PageResponse<T>(List<T> items, long total, int page, int pageSize, int totalPages) {

    public static <E, T> PageResponse<T> of(Page<E> page, int pageNumber, int pageSize, Function<E, T> mapper) {
        List<T> items = page.getContent().stream().map(mapper).toList();
        return new PageResponse<>(items, page.getTotalElements(), pageNumber, pageSize, page.getTotalPages());
    }
}
