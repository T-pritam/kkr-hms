package tech.pritamrao.kkrhms.repository;

import tech.pritamrao.kkrhms.entity.*;
import tech.pritamrao.kkrhms.service.*;
import tech.pritamrao.kkrhms.dto.*;
import tech.pritamrao.kkrhms.exception.*;
import tech.pritamrao.kkrhms.common.*;
import tech.pritamrao.kkrhms.security.*;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface DoctorRepository extends JpaRepository<Doctor, UUID> {

    List<Doctor> findAllByOrderByNameAsc();

    @Query("""
            select d from Doctor d
            where (:search is null or :search = ''
                   or lower(d.name) like lower(concat('%', :search, '%'))
                   or lower(d.specialist) like lower(concat('%', :search, '%'))
                   or lower(d.email) like lower(concat('%', :search, '%'))
                   or lower(d.mobile) like lower(concat('%', :search, '%')))
            order by d.createdAt desc
            """)
    Page<Doctor> search(@Param("search") String search, Pageable pageable);
}
